"""Shared fixtures for the `tests/api` suite.

Phase 21 introduces tests that need cookie-authenticated TestClients —
mirror the convention used by tests/contract/conftest.py so the same
``client`` / ``anon_client`` API is available here too.
"""
from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def anon_client():
    from fastapi.testclient import TestClient

    from backend.main import app

    return TestClient(app)


@pytest.fixture(scope="session")
def frank_client(anon_client):
    res = anon_client.post(
        "/api/v1/auth/login",
        json={"email": "frank@scherzinger.de", "password": "frank-demo-2026"},
    )
    if res.status_code != 200:
        pytest.skip(
            f"frank user not seeded — run scripts/seed_auth.py "
            f"(login returned {res.status_code}: {res.text})"
        )
    return anon_client


@pytest.fixture
def client(frank_client):
    """Default authenticated client for tests/api/."""
    return frank_client


@pytest.fixture(autouse=True)
def _reset_login_rate_limit():
    from backend.auth.rate_limit import reset_for_tests

    reset_for_tests()
    yield
    reset_for_tests()
