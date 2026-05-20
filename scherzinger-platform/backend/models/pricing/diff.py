"""Pricing Studio v3 / Phase 4 — DiffSummary wire shapes.

``GET /api/v1/pricing/sku/{aid}/diff?since=...`` returns a deterministic
alpha-ordered list of changes since ``since`` so the frontend "What
changed since you last looked" strip can render with no client-side
sorting.

Five canonical change kinds (extensible — add a new ``ChangeKind`` value
when a new diff source comes online):
  - ``cost``             current unit cost moved
  - ``competitor_signal`` median competitor price moved
  - ``proposal``          a proposal was created/approved in the window
  - ``customer_risk``     per-customer ``risk_if_moved`` moved
  - ``price``             list/current price moved (Phase 4.2.3 future use)

Each row carries ``lineage_ref`` so the View Lineage pill resolves, and a
``link_target`` string so the frontend can deep-link to the right
surface (e.g. forecasting cluster tab for a cost change).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChangeKind(str, Enum):
    COST = "cost"
    COMPETITOR_SIGNAL = "competitor_signal"
    CUSTOMER_RISK = "customer_risk"
    PRICE = "price"
    PROPOSAL = "proposal"


class DiffChange(BaseModel):
    """One row of the diff strip. Decimal-precise across the wire."""

    model_config = ConfigDict(from_attributes=True)

    kind: ChangeKind
    before: Optional[Decimal] = None
    after: Optional[Decimal] = None
    pct: Optional[Decimal] = None
    label: Optional[str] = Field(
        default=None,
        description="Human label for the change — e.g. proposal draft id.",
    )
    customer_id: Optional[str] = None
    lineage_ref: Optional[UUID] = None
    link_target: Optional[str] = Field(
        default=None,
        description="Frontend deep-link target (router path + hash) so the "
        "diff row resolves to the relevant surface on click.",
    )


class DiffSummary(BaseModel):
    """Per-(aid, since) collapsed diff over major state fields."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    since: datetime
    now: datetime
    changes: list[DiffChange] = Field(default_factory=list)
    summary_lineage_ref: UUID
