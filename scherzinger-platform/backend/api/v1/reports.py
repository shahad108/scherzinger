"""Phase 6 — report job lifecycle.

The Action Center "Generate PDF" / "Send to Till" CTAs route through
``report_jobs``. The job runs synchronously today (the MVP renders an
HTML artifact and stores it as ``payload.artifact_html``); future
phases can swap in a PDF renderer / SES email worker without changing
the contract.

Statuses: ``ready`` (artifact attached), ``sent`` (forwarded), ``failed``
(payload.error set).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import AbTest, AuditLog, PricingProposal, Recommendation, ReportJob
from backend.services import workflow_service
from backend.services.action_center.composer import build_action_center

router = APIRouter(prefix="/reports", tags=["reports"])


def _json_safe(value: Any) -> Any:
    """Coerce Decimal / datetime / UUID to JSON-serializable primitives.

    JSONB columns require json.dumps-able payloads; SQLAlchemy Numeric
    returns Decimal which raw json doesn't handle. Walk the payload tree
    and normalize so report_jobs.payload always persists cleanly.
    """
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


class ReportFilters(BaseModel):
    week: str | None = None
    cluster: str | None = None
    hide_locked: bool = False
    limit: int = 200


# ---------------------------------------------------------------------------
# job creation


def _gather_action_center_state(db: Session, ctx: AuthContext) -> dict[str, Any]:
    """Snapshot recommendations + proposals + A/B tests + last 30 audit rows
    for the report payload. The Action Center composer fan-out handles
    the live cards; this side-table query collects the durable state so
    the report stays meaningful even after cache invalidation."""
    recs = (
        db.query(Recommendation)
        .order_by(Recommendation.updated_at.desc())
        .limit(50)
        .all()
    )
    proposals = (
        db.query(PricingProposal)
        .order_by(PricingProposal.created_at.desc())
        .limit(50)
        .all()
    )
    ab_tests = (
        db.query(AbTest)
        .order_by(AbTest.start_date.desc())
        .limit(20)
        .all()
    )
    audit = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(30)
        .all()
    )

    actor_name = getattr(ctx, "name", None) or getattr(ctx, "user_id", None) or "Frank"

    proposals_serialized = [workflow_service.serialize_proposal(p) for p in proposals]
    impact_total = sum(
        ((p.proposed_price or 0) - (p.current_price or 0))
        for p in proposals
        if p.current_price is not None and p.proposed_price is not None
    )

    return {
        "recommendations": [workflow_service.serialize_recommendation(r) for r in recs],
        "proposals": proposals_serialized,
        "ab_tests": [
            {
                "id": str(t.id),
                "aid": t.aid,
                "status": t.status,
                "slice_pct": float(t.slice_pct) if t.slice_pct is not None else None,
                "control_price": float(t.control_price) if t.control_price is not None else None,
                "treatment_price": float(t.treatment_price) if t.treatment_price is not None else None,
            }
            for t in ab_tests
        ],
        "audit": [
            {
                "id": str(a.id),
                "actor": a.actor_persona,
                "kind": a.action_kind,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "delta_pp": float(a.delta_pp) if a.delta_pp is not None else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                # Phase 9 — the audit_hash is the defensibility token Till
                # asks for. Surface it on every row so the report footer
                # carries the same chain Frank quotes in conversation.
                "audit_hash": getattr(a, "audit_hash", None),
            }
            for a in audit
        ],
        "summary": {
            "recommendation_count": len(recs),
            "proposal_count": len(proposals),
            "draft_proposal_count": sum(1 for p in proposals if p.status == "draft"),
            "pending_approval_count": sum(1 for p in proposals if p.status == "pending_approval"),
            "ab_test_count": len(ab_tests),
            "audit_count": len(audit),
            "estimated_impact_eur_per_unit": round(impact_total, 2),
            "generated_for": ctx.user_id and str(ctx.user_id),
            "generated_for_name": actor_name,
            "generated_at": datetime.utcnow().isoformat(),
        },
    }


def _render_html(state: dict[str, Any], filters: dict[str, Any]) -> str:
    """Phase 9 — branded, print-ready HTML artifact.

    Includes ``@page`` rules so the user's "Print to PDF" in the browser
    produces a clean A4 PDF with the Pryzm/Scherzinger header on every
    page. A real PDF renderer (WeasyPrint / headless Chrome) can swap in
    without touching the route contract or the embedded styling — the
    same HTML round-trips through either pipeline.
    """
    s = state["summary"]
    filters_str = ", ".join(f"{k}={v}" for k, v in filters.items()) if filters else "none"
    actor_name = s.get("generated_for_name") or "Frank"

    rec_rows = "".join(
        f"<tr><td>{r['source_kind']}</td><td>{r['title']}</td><td>{r['status']}</td>"
        f"<td>{r['article_id'] or ''}</td><td>{r['cluster'] or ''}</td></tr>"
        for r in state["recommendations"][:25]
    )
    prop_rows = "".join(
        f"<tr><td>{p['article_id']}</td>"
        f"<td class='num'>€{(p['current_price'] or 0):.2f}</td>"
        f"<td class='num'>€{(p['proposed_price'] or 0):.2f}</td>"
        f"<td class='num delta'>{'+' if (p['delta_pp'] or 0) >= 0 else ''}{(p['delta_pp'] or 0):.2f}pp</td>"
        f"<td>{p['status']}</td></tr>"
        for p in state["proposals"][:25]
    )
    ab_rows = "".join(
        f"<tr><td>{t['aid']}</td><td>{t['status']}</td>"
        f"<td class='num'>€{(t['control_price'] or 0):.2f}</td>"
        f"<td class='num'>€{(t['treatment_price'] or 0):.2f}</td>"
        f"<td class='num'>{(t.get('slice_pct') or 0) * 100:.0f}%</td></tr>"
        for t in state["ab_tests"]
    )
    audit_rows = "".join(
        f"<tr><td class='num'>{i+1}</td><td>{a['kind']}</td>"
        f"<td>{a.get('target_id') or '—'}</td>"
        f"<td class='hash'><code>{(a.get('audit_hash') or '—')[:16]}</code></td>"
        f"<td class='ts'>{(a.get('created_at') or '')[:19].replace('T', ' ')}</td></tr>"
        for i, a in enumerate(state["audit"][:30])
    )

    impact = s.get("estimated_impact_eur_per_unit") or 0.0

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Scherzinger Pricing Report — {s['generated_at'][:10]}</title>
<style>
  @page {{
    size: A4;
    margin: 18mm 16mm 22mm 16mm;
    @bottom-left {{
      content: "Pryzm · Scherzinger Pricing Report · {s['generated_at'][:10]}";
      font: 9pt 'Inter', sans-serif;
      color: #8a8a96;
    }}
    @bottom-right {{
      content: "Page " counter(page) " of " counter(pages);
      font: 9pt 'Inter', sans-serif;
      color: #8a8a96;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font: 12px/1.55 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1a1a1f;
    max-width: 880px;
    margin: 0 auto;
    padding: 32px 24px 48px;
    background: #fff;
  }}
  .brand-band {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 -24px 24px;
    padding: 14px 24px;
    background: linear-gradient(135deg, #fef7f4 0%, #faf4ef 100%);
    border-bottom: 2px solid #c8634a;
    page-break-after: avoid;
  }}
  .brand-band .pryzm-mark {{
    font-family: 'Manrope', 'Inter', sans-serif;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.02em;
    color: #c8634a;
  }}
  .brand-band .pryzm-mark::before {{
    content: '◆';
    margin-right: 6px;
    color: #c8634a;
  }}
  .brand-band .client {{ font-size: 11px; color: #5a5a64; text-align: right; }}
  .brand-band .client b {{ display: block; font-size: 13px; color: #1a1a1f; }}
  h1 {{
    font-family: 'Manrope', 'Inter', sans-serif;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 4px;
  }}
  .sub {{ color: #6e6e7a; font-size: 11.5px; margin-bottom: 16px; }}
  .meta {{
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 4px 12px;
    margin: 0 0 20px;
    padding: 10px 12px;
    background: #faf7f3;
    border-radius: 8px;
    border: 1px solid #eee5dc;
    font-size: 11px;
  }}
  .meta dt {{ font-weight: 600; color: #6e6e7a; text-transform: uppercase; letter-spacing: 0.04em; font-size: 9.5px; padding-top: 1px; }}
  .meta dd {{ margin: 0; color: #2a2a30; }}
  .kpis {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 8px 0 24px;
    page-break-inside: avoid;
  }}
  .kpi {{
    border: 1px solid #eee5dc;
    border-radius: 10px;
    padding: 10px 12px;
    background: #fff;
  }}
  .kpi .l {{ font-size: 9.5px; text-transform: uppercase; color: #8a6e5a; letter-spacing: .05em; font-weight: 600; }}
  .kpi .v {{
    font-family: 'Manrope', 'Inter', sans-serif;
    font-size: 22px;
    font-weight: 800;
    margin-top: 2px;
    color: #1a1a1f;
  }}
  .kpi .s {{ font-size: 10px; color: #6e6e7a; margin-top: 1px; }}
  h2 {{
    font-family: 'Manrope', 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 700;
    margin: 24px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #eee5dc;
    page-break-after: avoid;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    page-break-inside: auto;
  }}
  tr {{ page-break-inside: avoid; }}
  th, td {{
    border-bottom: 1px solid #f4ede4;
    padding: 6px 8px;
    text-align: left;
    font-size: 11px;
  }}
  th {{
    font-weight: 600;
    color: #6e6e7a;
    text-transform: uppercase;
    font-size: 9.5px;
    letter-spacing: .04em;
    background: #faf7f3;
  }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  td.delta {{ font-weight: 600; color: #c8634a; }}
  td.hash code {{ font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #5a5a64; }}
  td.ts {{ color: #6e6e7a; font-size: 10.5px; }}
  .audit-section {{ page-break-before: auto; }}
  .audit-section .preamble {{
    margin: 4px 0 8px;
    padding: 8px 10px;
    background: #faf7f3;
    border-left: 3px solid #c8634a;
    border-radius: 4px;
    font-size: 10.5px;
    color: #5a5a64;
  }}
  .footer {{
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid #eee5dc;
    font-size: 10px;
    color: #6e6e7a;
    line-height: 1.5;
  }}
  .footer b {{ color: #1a1a1f; }}
</style></head>
<body>
<header class="brand-band">
  <div class="pryzm-mark">Pryzm</div>
  <div class="client"><b>Scherzinger GmbH</b>Pricing Action Center</div>
</header>

<h1>Action Center Report</h1>
<div class="sub">Pricing decisions, proposals, and A/B experiments · {s['generated_at'][:10]}</div>

<dl class="meta">
  <dt>Prepared by</dt><dd>{actor_name}</dd>
  <dt>Generated</dt><dd>{s['generated_at']} UTC</dd>
  <dt>Filters</dt><dd>{filters_str}</dd>
  <dt>Window</dt><dd>Last 50 recommendations · 50 proposals · 20 A/B tests · 30 audit events</dd>
</dl>

<div class="kpis">
  <div class="kpi"><div class="l">Recommendations</div><div class="v">{s['recommendation_count']}</div><div class="s">live signals</div></div>
  <div class="kpi"><div class="l">Proposals</div><div class="v">{s['proposal_count']}</div><div class="s">{s['draft_proposal_count']} draft · {s['pending_approval_count']} pending</div></div>
  <div class="kpi"><div class="l">A/B tests</div><div class="v">{s['ab_test_count']}</div><div class="s">running + recent</div></div>
  <div class="kpi"><div class="l">Est. Δ price</div><div class="v">€{impact:,.2f}</div><div class="s">per unit, accepted</div></div>
</div>

<h2>Recommendations</h2>
<table><thead><tr><th>Kind</th><th>Title</th><th>Status</th><th>Article</th><th>Cluster</th></tr></thead><tbody>{rec_rows or '<tr><td colspan="5" style="color:#8a8a96">No recommendations in window.</td></tr>'}</tbody></table>

<h2>Pricing proposals</h2>
<table><thead><tr><th>Article</th><th class="num">Current</th><th class="num">Proposed</th><th class="num">Δ</th><th>Status</th></tr></thead><tbody>{prop_rows or '<tr><td colspan="5" style="color:#8a8a96">No proposals in window.</td></tr>'}</tbody></table>

<h2>A/B tests</h2>
<table><thead><tr><th>Article</th><th>Status</th><th class="num">Control</th><th class="num">Treatment</th><th class="num">Slice</th></tr></thead><tbody>{ab_rows or '<tr><td colspan="5" style="color:#8a8a96">No A/B tests in window.</td></tr>'}</tbody></table>

<section class="audit-section">
  <h2>Audit hash chain</h2>
  <div class="preamble">
    Every action recorded against this Action Center carries a hash. The chain below is the
    defensibility receipt — Till can verify any decision against the immutable
    <code>audit_log</code> table by hash prefix. Latest 30 events shown; full chain in
    <code>audit_log.audit_hash</code>.
  </div>
  <table><thead><tr><th>#</th><th>Action</th><th>Target</th><th>Hash (prefix)</th><th>Recorded</th></tr></thead><tbody>{audit_rows or '<tr><td colspan="5" style="color:#8a8a96">No audit events in window.</td></tr>'}</tbody></table>
</section>

<div class="footer">
  <b>Pryzm · Pricing Action Center · {s['generated_at'][:10]}</b><br/>
  Frank's outputs flow upward to Till (Managing Director review) and outward to Heiko (Sales
  Account Management). Reports persist as <code>report_jobs</code> rows so the chain stays
  reproducible after this artifact is filed.
</div>
</body></html>"""


@router.post("/action-center", status_code=status.HTTP_201_CREATED)
async def create_action_center_report(
    body: ReportFilters = Body(default_factory=ReportFilters),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Synchronous render — returns the job already in `ready` state with
    the HTML artifact attached. Long-running renders move to a Celery
    worker without changing the response shape."""
    filters = body.model_dump(exclude_none=True)
    try:
        # Touch the live composer so the snapshot reflects the same data
        # the analyst sees on screen — this also surfaces composer errors
        # synchronously instead of after the job lands in `failed`.
        await build_action_center(
            user_id=str(ctx.user_id),
            user_name=getattr(ctx, "name", None) or "Frank",
            persona=getattr(ctx, "persona", None) or "frank",
            week=body.week,
            cluster=body.cluster,
            hide_locked=body.hide_locked,
            limit=body.limit,
        )
        state = _gather_action_center_state(db, ctx)
        html = _render_html(state, filters)
        job = ReportJob(
            screen="action-center",
            filters=filters,
            status="ready",
            created_by=ctx.user_id,
            artifact_url=None,
            payload=_json_safe({"state": state, "artifact_html": html}),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        # Surface a download URL + content preview the frontend uses for
        # the post-generate inline tile (Phase 9).
        return {
            **workflow_service.serialize_report(job),
            "download_url": f"/api/v1/reports/{job.id}/download",
            "preview": state["summary"],
        }
    except Exception as exc:  # noqa: BLE001 — surface to the user
        # Persist the failure so the frontend can show a retry button.
        job = ReportJob(
            screen="action-center",
            filters=filters,
            status="failed",
            created_by=ctx.user_id,
            payload={"error": str(exc)},
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            {"job_id": str(job.id), "error": str(exc)},
        ) from exc


@router.get("/{report_id}")
def get_report(
    report_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    job = db.get(ReportJob, report_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    return {
        **workflow_service.serialize_report(job),
        "download_url": f"/api/v1/reports/{job.id}/download" if job.status in {"ready", "sent"} else None,
    }


@router.get("/{report_id}/download")
def download_report(
    report_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> Response:
    job = db.get(ReportJob, report_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    html = (job.payload or {}).get("artifact_html")
    if not html:
        raise HTTPException(status.HTTP_409_CONFLICT, "report artifact not ready")
    return Response(
        content=html,
        media_type="text/html",
        headers={
            "Content-Disposition": f'inline; filename="action-center-report-{job.id}.html"',
        },
    )


class ReportSendBody(BaseModel):
    recipient: str = "till"
    note: str | None = None


@router.post("/{report_id}/send")
def send_report(
    report_id: UUID,
    body: ReportSendBody = Body(default_factory=ReportSendBody),
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    job = db.get(ReportJob, report_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "report not found")
    if job.status != "ready":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"report status is '{job.status}'; only 'ready' reports can be sent",
        )
    job.status = "sent"
    payload = dict(job.payload or {})
    payload["sent"] = {
        "recipient": body.recipient,
        "note": body.note,
        "at": datetime.utcnow().isoformat(),
    }
    job.payload = payload
    db.commit()
    db.refresh(job)
    return {
        **workflow_service.serialize_report(job),
        "download_url": f"/api/v1/reports/{job.id}/download",
    }
