"""Each canonical mock JSON parses cleanly through its Pydantic screen model."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.schemas.screens import (
    ActionCenterData,
    AiShell,
    ForecastShell,
    MarginCockpitData,
    QuotesShell,
    ShellRailData,
    StudioShell,
)

SEEDS = Path(__file__).resolve().parents[2] / "backend" / "seeds" / "screens"
FRONTEND_MOCKS = (
    Path(__file__).resolve().parents[3] / "frontend-v2" / "src" / "data" / "mocks"
)

# Backend seed JSON is the schema source-of-truth for screens that still
# ship a backend fallback payload. The Action Center stopped carrying a
# backend seed in the Task 2 cleanup (plan §4 iron rule 7) — its schema
# is exercised against the frontend mock instead, which is the canonical
# fixture for mock-mode demos and contract tests.
CASES = [
    (SEEDS, "shell.json", ShellRailData),
    (FRONTEND_MOCKS, "action-center.json", ActionCenterData),
    (SEEDS, "margin-cockpit.json", MarginCockpitData),
    (SEEDS, "quotes.json", QuotesShell),
    (SEEDS, "forecast.json", ForecastShell),
    (SEEDS, "studio.json", StudioShell),
    (SEEDS, "ai.json", AiShell),
]


@pytest.mark.parametrize("source_dir,filename,model", CASES)
def test_mock_parses_through_screen_schema(source_dir: Path, filename: str, model) -> None:
    payload = json.loads((source_dir / filename).read_text(encoding="utf-8"))
    parsed = model.model_validate(payload)
    # Round-trip preserves the original (Pydantic RootModel passes through).
    assert parsed.model_dump() == payload
