"""Pricing Studio v3 / Phase 7 — branded proposal export.

Renders a proposal's recommendation card + customer fan-out + audit
history excerpt + lineage references into a downloadable artefact.

Output strategy (auto-detect):
  1. ``reportlab``    → real PDF bytes (``Content-Type: application/pdf``).
  2. ``weasyprint``   → real PDF bytes (HTML → PDF rendering).
  3. Fallback        → a clean HTML document. Content-Type is
                       ``text/html; charset=utf-8`` and the endpoint
                       advertises this in the response so the frontend
                       can still open it in a new tab.

The function returns a tuple ``(bytes, content_type)`` so the API layer
can set headers correctly. The endpoint also writes a
``push_to_quoting`` audit row so the export is visible in the timeline.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models import PricingProposal
from backend.models.pricing.audit import PricingAuditEntry

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data assembly
# ---------------------------------------------------------------------------


def _safe(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def _collect_proposal_context(
    *, proposal_id: UUID, db_session: Session
) -> dict[str, Any]:
    """Gather everything the PDF/HTML body needs in one read pass."""
    proposal = db_session.get(PricingProposal, proposal_id)
    if proposal is None:
        return {}
    payload = proposal.payload or {}

    audits = (
        db_session.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == proposal.article_id)
        .order_by(PricingAuditEntry.at.desc())
        .limit(10)
        .all()
    )

    return {
        "proposal_id": str(proposal.id),
        "article_id": proposal.article_id,
        "current_price": str(proposal.current_price) if proposal.current_price is not None else None,
        "proposed_price": str(proposal.proposed_price) if proposal.proposed_price is not None else None,
        "delta_pp": str(proposal.delta_pp) if proposal.delta_pp is not None else None,
        "status": proposal.status,
        "created_at": proposal.created_at.isoformat() if proposal.created_at else None,
        "payload": payload,
        "customer_fanout": payload.get("customer_fanout") or [],
        "rationale": payload.get("rationale") or payload.get("memo") or "",
        "notify": payload.get("notify") or {},
        "lineage_refs": payload.get("lineage_refs") or [],
        "drivers": payload.get("drivers") or [],
        "audit_excerpt": [
            {
                "at": a.at.isoformat() if a.at else None,
                "actor": a.actor,
                "action": a.action,
                "reason": a.reason,
            }
            for a in audits
        ],
    }


# ---------------------------------------------------------------------------
# HTML rendering (used directly + as the input to weasyprint)
# ---------------------------------------------------------------------------


_DOC_STYLE = """
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #1f2937;
  max-width: 720px;
  margin: 32px auto;
  padding: 0 24px;
  line-height: 1.5;
}
h1 { font-size: 22px; margin-bottom: 4px; }
h2 { font-size: 16px; margin-top: 28px; margin-bottom: 8px; color: #374151; }
.meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
.card {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 16px;
  margin: 12px 0;
  background: #fafafa;
}
.kv { display: flex; justify-content: space-between; padding: 4px 0; }
.kv .k { color: #6b7280; }
.kv .v { font-variant-numeric: tabular-nums; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
.footer { color: #6b7280; font-size: 11px; margin-top: 32px; }
.delta-up { color: #047857; }
.delta-down { color: #b91c1c; }
"""


def _render_html(context: dict[str, Any]) -> str:
    if not context:
        return (
            "<!doctype html><html><body><h1>Proposal not found</h1></body></html>"
        )

    drivers_rows = ""
    for d in context.get("drivers", []):
        drivers_rows += (
            f"<tr><td>{_safe(d.get('kind'))}</td>"
            f"<td>{_safe(d.get('label'))}</td>"
            f"<td>{_safe(d.get('contribution_pct'))}</td></tr>"
        )

    fanout_rows = ""
    for f in context.get("customer_fanout", [])[:20]:
        fanout_rows += (
            f"<tr><td>{_safe(f.get('customer_id') or f.get('id'))}</td>"
            f"<td>{_safe(f.get('tier'))}</td>"
            f"<td>{_safe(f.get('current_price'))}</td>"
            f"<td>{_safe(f.get('at_proposed_price'))}</td>"
            f"<td>{_safe(f.get('win_prob'))}</td></tr>"
        )

    audit_rows = ""
    for a in context.get("audit_excerpt", []):
        audit_rows += (
            f"<tr><td>{_safe(a.get('at'))}</td>"
            f"<td>{_safe(a.get('actor'))}</td>"
            f"<td>{_safe(a.get('action'))}</td>"
            f"<td>{_safe(a.get('reason'))}</td></tr>"
        )

    lineage_rows = ""
    for ref in context.get("lineage_refs", []):
        lineage_rows += (
            f"<tr><td>{_safe(ref.get('source_kind'))}</td>"
            f"<td>{_safe(ref.get('source_id'))}</td>"
            f"<td>{_safe(ref.get('id'))}</td></tr>"
        )

    notify = context.get("notify") or {}
    notify_str = ", ".join(
        f"{_safe(k)}={_safe(v)}" for k, v in notify.items() if v
    ) or "—"

    return f"""<!doctype html>
<html><head><meta charset="utf-8"/><title>Pricing proposal {_safe(context.get('proposal_id'))}</title>
<style>{_DOC_STYLE}</style></head>
<body>
  <h1>Pricing proposal · {_safe(context.get('article_id'))}</h1>
  <div class="meta">Proposal {_safe(context.get('proposal_id'))} · status {_safe(context.get('status'))} · created {_safe(context.get('created_at'))}</div>

  <h2>Recommendation</h2>
  <div class="card">
    <div class="kv"><span class="k">Current price</span><span class="v">{_safe(context.get('current_price'))} EUR</span></div>
    <div class="kv"><span class="k">Proposed price</span><span class="v">{_safe(context.get('proposed_price'))} EUR</span></div>
    <div class="kv"><span class="k">Delta</span><span class="v">{_safe(context.get('delta_pp'))}</span></div>
  </div>

  <h2>Rationale</h2>
  <div class="card">{_safe(context.get('rationale')) or '—'}</div>

  <h2>Drivers</h2>
  <table>
    <thead><tr><th>Kind</th><th>Label</th><th>Contribution</th></tr></thead>
    <tbody>{drivers_rows or '<tr><td colspan="3">—</td></tr>'}</tbody>
  </table>

  <h2>Customer fan-out</h2>
  <table>
    <thead><tr><th>Customer</th><th>Tier</th><th>Current</th><th>At proposed</th><th>Win prob</th></tr></thead>
    <tbody>{fanout_rows or '<tr><td colspan="5">—</td></tr>'}</tbody>
  </table>

  <h2>Notify</h2>
  <div class="card">{notify_str}</div>

  <h2>Audit history (latest 10)</h2>
  <table>
    <thead><tr><th>At</th><th>Actor</th><th>Action</th><th>Reason</th></tr></thead>
    <tbody>{audit_rows or '<tr><td colspan="4">—</td></tr>'}</tbody>
  </table>

  <h2>Lineage references</h2>
  <table>
    <thead><tr><th>Source kind</th><th>Source id</th><th>Lineage ref</th></tr></thead>
    <tbody>{lineage_rows or '<tr><td colspan="3">—</td></tr>'}</tbody>
  </table>

  <div class="footer">
    Rendered {_safe(datetime.now(timezone.utc).isoformat())} · Scherzinger Pricing Studio v3
  </div>
</body></html>
"""


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------


def _try_reportlab(context: dict[str, Any]) -> Optional[bytes]:
    """Render with reportlab when available. Returns None otherwise."""
    try:
        from reportlab.lib.pagesizes import A4  # type: ignore
        from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
        from reportlab.platypus import (  # type: ignore
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
        from reportlab.lib import colors  # type: ignore
    except ImportError:
        return None

    from io import BytesIO

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=f"Proposal {context.get('article_id')}")
    styles = getSampleStyleSheet()
    story: list[Any] = []

    story.append(Paragraph(
        f"Pricing proposal · {_safe(context.get('article_id'))}",
        styles["Title"],
    ))
    story.append(Paragraph(
        f"Proposal {_safe(context.get('proposal_id'))} · status {_safe(context.get('status'))}",
        styles["Normal"],
    ))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Recommendation", styles["Heading2"]))
    rec_data = [
        ["Current price", f"{context.get('current_price') or '—'} EUR"],
        ["Proposed price", f"{context.get('proposed_price') or '—'} EUR"],
        ["Delta", str(context.get("delta_pp") or "—")],
    ]
    t = Table(rec_data, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    rationale = context.get("rationale") or "—"
    story.append(Paragraph("Rationale", styles["Heading2"]))
    story.append(Paragraph(_safe(rationale), styles["BodyText"]))
    story.append(Spacer(1, 12))

    fanout = context.get("customer_fanout") or []
    if fanout:
        story.append(Paragraph("Customer fan-out", styles["Heading2"]))
        fanout_table = [["Customer", "Tier", "Current", "At proposed", "Win prob"]]
        for f in fanout[:20]:
            fanout_table.append([
                str(f.get("customer_id") or f.get("id") or "—"),
                str(f.get("tier") or "—"),
                str(f.get("current_price") or "—"),
                str(f.get("at_proposed_price") or "—"),
                str(f.get("win_prob") or "—"),
            ])
        story.append(Table(fanout_table, hAlign="LEFT"))
        story.append(Spacer(1, 12))

    audits = context.get("audit_excerpt") or []
    if audits:
        story.append(Paragraph("Audit history (latest 10)", styles["Heading2"]))
        audit_table = [["At", "Actor", "Action", "Reason"]]
        for a in audits:
            audit_table.append([
                str(a.get("at") or "—"),
                str(a.get("actor") or "—"),
                str(a.get("action") or "—"),
                str(a.get("reason") or "—"),
            ])
        story.append(Table(audit_table, hAlign="LEFT"))

    doc.build(story)
    return buf.getvalue()


def _try_weasyprint(context: dict[str, Any]) -> Optional[bytes]:
    try:
        from weasyprint import HTML  # type: ignore
    except ImportError:
        return None
    html_doc = _render_html(context)
    return HTML(string=html_doc).write_pdf()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def render_proposal_pdf(
    *,
    proposal_id: UUID,
    db_session: Session,
) -> tuple[bytes, str]:
    """Return (bytes, content_type).

    Preferred order: reportlab → weasyprint → HTML fallback.
    Callers (the endpoint) wire the content_type into the response.
    """
    context = _collect_proposal_context(
        proposal_id=proposal_id, db_session=db_session
    )

    body = _try_reportlab(context)
    if body is not None:
        return body, "application/pdf"

    body = _try_weasyprint(context)
    if body is not None:
        return body, "application/pdf"

    # Fallback: HTML. TODO(phase-10): drop a `reportlab` or
    # `weasyprint` dep into requirements.txt to make the export a real
    # PDF in all environments. v3 keeps the dep optional so dev
    # environments without native libs still serve a usable artefact.
    html_doc = _render_html(context)
    return html_doc.encode("utf-8"), "text/html; charset=utf-8"
