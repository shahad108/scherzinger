"""Contract test for Pricing Studio Phase A8.

Guarantees:

  1. ``get_rules()`` falls back to the seeded ``approval_routes`` DB table
     when ``backend/data/pricing_approval_rules.json`` is missing.
  2. After the file comes back, ``refresh_rules()`` reloads from disk
     (so the file-watcher hot-reload path is exercised).
  3. The end-to-end submit path keeps producing ``ApprovalDecision``
     without ever raising — even when the rules file is missing — which
     is the regression the plan calls out (typo in rules → 500 storm).
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from backend.services.pricing import approval_rules as ar
from backend.services.pricing.approval_rules import (
    Proposal,
    get_rules,
    load_rules,
    refresh_rules,
    reset_cache_for_tests,
    should_route_for_approval,
)


# ---------------------------------------------------------------------------
# Fakes: tiny stand-in for the SQLAlchemy ``ApprovalRoute`` rows + Session,
# so we don't need a Postgres connection for a contract that only cares
# about the file/DB fallback ordering.
# ---------------------------------------------------------------------------


def _seeded_routes() -> list[SimpleNamespace]:
    return [
        SimpleNamespace(
            name="db-md-route",
            condition={">": [{"var": "delta_pct"}, 5]},
            route_to=["md"],
            note="seeded MD route",
            enabled=True,
            created_at=None,
        ),
    ]


class _FakeQuery:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def filter(self, *_args: Any, **_kwargs: Any) -> "_FakeQuery":
        return self

    def order_by(self, *_args: Any, **_kwargs: Any) -> "_FakeQuery":
        return self

    def all(self) -> list[Any]:
        return list(self._rows)


class _FakeSession:
    """Quacks like ``sqlalchemy.orm.Session.query(ApprovalRoute)``."""

    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def query(self, _model: Any) -> _FakeQuery:
        return _FakeQuery(self._rows)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _isolate_cache():
    """Reset the rules cache before and after every test in this module."""
    reset_cache_for_tests()
    yield
    reset_cache_for_tests()


@pytest.fixture
def temp_rules_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the engine at a tmp rules file we can delete + restore."""
    path = tmp_path / "pricing_approval_rules.json"
    path.write_text(
        json.dumps(
            {
                "rules": [
                    {
                        "id": "file-md-route",
                        "condition": {">": [{"var": "delta_pct"}, 5]},
                        "route_to": ["md"],
                        "note": "from file",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(ar, "DEFAULT_RULES_PATH", path)
    monkeypatch.setattr(ar, "_rules_path", path)
    return path


# ---------------------------------------------------------------------------
# 1. DB fallback when the file is missing
# ---------------------------------------------------------------------------


def test_get_rules_falls_back_to_db_when_file_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    missing = tmp_path / "does_not_exist.json"
    monkeypatch.setattr(ar, "DEFAULT_RULES_PATH", missing)
    monkeypatch.setattr(ar, "_rules_path", missing)

    session = _FakeSession(_seeded_routes())
    rules = load_rules(db=session)

    assert len(rules) == 1
    assert rules[0]["id"] == "db-md-route"
    assert rules[0]["route_to"] == ["md"]

    # And get_rules returns the cached list without another DB hit.
    again = get_rules()
    assert again is rules


def test_should_route_for_approval_does_not_500_when_file_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The regression the plan calls out: a missing/invalid rules file
    used to 500 every submit. With the cache + DB fallback we degrade
    gracefully — proposal submission still produces a decision."""
    missing = tmp_path / "still_does_not_exist.json"
    monkeypatch.setattr(ar, "DEFAULT_RULES_PATH", missing)
    monkeypatch.setattr(ar, "_rules_path", missing)

    # Warm the cache from the DB stub so get_rules() inside
    # should_route_for_approval finds something.
    load_rules(db=_FakeSession(_seeded_routes()))

    decision = should_route_for_approval(
        Proposal(delta_pct=7.0, delta_pp=3.0, tier="C", effective_in_hours=72)
    )
    assert "md" in decision.needs
    assert "db-md-route" in decision.thresholds_hit


def test_get_rules_returns_empty_list_when_file_and_db_both_unavailable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Last-resort safety: no file, no DB → empty list, never an exception."""
    missing = tmp_path / "nope.json"
    monkeypatch.setattr(ar, "DEFAULT_RULES_PATH", missing)
    monkeypatch.setattr(ar, "_rules_path", missing)

    # No db arg at all.
    rules = load_rules()
    assert rules == []

    decision = should_route_for_approval(
        Proposal(delta_pct=99.0, delta_pp=99.0, tier="A", effective_in_hours=1)
    )
    # No rules fired → no needs, no block, default auto_approve flag.
    assert decision.needs == []
    assert decision.block is False


# ---------------------------------------------------------------------------
# 2. refresh_rules() reloads from the (restored) file
# ---------------------------------------------------------------------------


def test_refresh_rules_reloads_from_file_after_restore(
    temp_rules_file: Path,
) -> None:
    # Initial load reads the file.
    rules = load_rules()
    assert len(rules) == 1
    assert rules[0]["id"] == "file-md-route"

    # Mutate the file as if someone edited it on disk.
    temp_rules_file.write_text(
        json.dumps(
            {
                "rules": [
                    {
                        "id": "file-md-route",
                        "condition": {">": [{"var": "delta_pct"}, 5]},
                        "route_to": ["md"],
                    },
                    {
                        "id": "file-cfo-route",
                        "condition": {">": [{"var": "delta_pct"}, 20]},
                        "route_to": ["cfo"],
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    # get_rules() alone keeps the old cache (no implicit reload).
    cached = get_rules()
    assert len(cached) == 1

    # refresh_rules() picks up the new contents — this is what the
    # file-watcher invokes on a save event.
    reloaded = refresh_rules()
    assert {r["id"] for r in reloaded} == {"file-md-route", "file-cfo-route"}


def test_file_takes_precedence_over_db_when_present(
    temp_rules_file: Path,
) -> None:
    """If the file is readable, the DB fallback must never run."""
    rules = load_rules(db=_FakeSession(_seeded_routes()))
    # The seeded DB row has id ``db-md-route``; the file has
    # ``file-md-route``. Seeing the file id proves precedence.
    assert {r["id"] for r in rules} == {"file-md-route"}


# ---------------------------------------------------------------------------
# 3. Watcher is a no-op under pytest
# ---------------------------------------------------------------------------


def test_start_file_watcher_is_noop_under_pytest(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """We must never start a background thread inside the test runner."""
    # ``PYTEST_CURRENT_TEST`` is set by pytest itself while a test runs.
    assert "PYTEST_CURRENT_TEST" in __import__("os").environ
    observer = ar.start_file_watcher()
    assert observer is None
