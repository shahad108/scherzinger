"""Phase 21e migration parseability + chain test.

Verifies the new ``p21e_proposal_payload_customer_index`` migration:
  - imports cleanly (parseable Python)
  - declares the correct down_revision (chained after p21d)
  - upgrade() and downgrade() execute the expected SQL when run against
    a mocked ``op``
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import patch


_MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "alembic"
    / "versions"
    / "p21e_proposal_payload_customer_index.py"
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location(
        "_p21e_migration", _MIGRATION_PATH
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_p21e_chain_and_revision_ids() -> None:
    mod = _load_migration_module()
    # Phase 4 renamed this revision id from the original
    # ``p21e_proposal_payload_customer_index`` (36 chars) to fit inside
    # the legacy ``alembic_version.version_num`` VARCHAR(32) column —
    # the original chain failed at version-stamp time on Postgres.
    assert mod.revision == "p21e_prop_pay_cust_idx"
    assert mod.down_revision == "p21d_customer_on_sku_snapshot"


def test_p21e_upgrade_creates_partial_functional_index() -> None:
    mod = _load_migration_module()
    with patch.object(mod.op, "execute") as exec_mock:
        mod.upgrade()
    assert exec_mock.call_count == 1
    sql = exec_mock.call_args[0][0]
    assert "CREATE INDEX" in sql
    assert "ix_pricing_proposals_aid_payload_cid" in sql
    assert "pricing_proposals" in sql
    assert "article_id" in sql
    assert "payload->>'customer_id'" in sql
    assert "draft" in sql and "submitted" in sql and "pending" in sql


def test_p21e_downgrade_drops_index() -> None:
    mod = _load_migration_module()
    with patch.object(mod.op, "execute") as exec_mock:
        mod.downgrade()
    assert exec_mock.call_count == 1
    sql = exec_mock.call_args[0][0]
    assert "DROP INDEX" in sql
    assert "ix_pricing_proposals_aid_payload_cid" in sql
