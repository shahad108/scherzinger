"""Win/Loss driver composer — PA/PR rejection-code lens.

v2.2 Phase D. Per-cluster percentage of closed quotes lost to ``PA``
(competitor cheaper) and ``PR`` (price too high) over a recent window,
plus a 12-month monthly sparkline so Frank can see if competitive
pressure is rising or falling.

Anchored to the most recent quote date in the table so the demo dataset
(which ends in the past) still produces a fresh-looking window — same
trick the Phase A rejection-signal helper uses.
"""
from __future__ import annotations

import datetime as _dt
import logging as _logging
from typing import Any

from sqlalchemy import text as _sql_text
from sqlalchemy.orm import Session

_log = _logging.getLogger(__name__)


def _cluster_key(commodity_group: str | None) -> str:
    """Mirror the composer's cluster key derivation."""
    return (commodity_group or "?").split(" ")[0]


def _month_key(d: _dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _sub_months(anchor: _dt.date, n: int) -> _dt.date:
    """Return the first-of-month date that is ``n`` whole months before
    ``anchor`` (anchor itself counts as month 0)."""
    y = anchor.year
    m = anchor.month - n
    while m <= 0:
        m += 12
        y -= 1
    return _dt.date(y, m, 1)


def _resolve_anchor(db: Session) -> _dt.date | None:
    row = db.execute(_sql_text(
        "SELECT MAX(date) FROM quotes WHERE rejection_code IN ('PA', 'PR')"
    )).fetchone()
    anchor = row[0] if row else None
    if anchor is None:
        return None
    # SQLite can return strings; normalise to date.
    if isinstance(anchor, str):
        try:
            anchor = _dt.date.fromisoformat(anchor[:10])
        except Exception:
            return None
    return anchor


def build_win_loss(
    db: Session | None,
    *,
    cluster: str | None = None,
    window_days: int = 90,
) -> dict[str, Any]:
    """Build the win/loss panel.

    Returns ``{window: {days, anchor}, rows: [...]}``. Each row:
    ``{cluster, paPct, prPct, sample, monthlySparkline: [12 entries]}``.

    ``paPct`` / ``prPct`` are percentages of *closed* quotes (won or lost)
    in the window that carry that rejection code. Empty rows is fine —
    the frontend renders null when there's nothing to show.
    """
    empty: dict[str, Any] = {
        "window": {"days": window_days, "anchor": ""},
        "rows": [],
    }
    if db is None:
        return empty

    try:
        anchor = _resolve_anchor(db)
        if anchor is None:
            return empty

        cutoff = anchor - _dt.timedelta(days=window_days)

        # === Window aggregates: total closed quotes and PA/PR counts per cluster.
        window_rows = db.execute(_sql_text(
            """
            SELECT commodity_group,
                   rejection_code,
                   COUNT(*) AS n
              FROM quotes
             WHERE date >= :cutoff
               AND date <= :anchor
               AND commodity_group IS NOT NULL
             GROUP BY commodity_group, rejection_code
            """
        ), {"cutoff": cutoff, "anchor": anchor}).fetchall()

        # cluster -> {"total": n, "PA": n, "PR": n}
        agg: dict[str, dict[str, int]] = {}
        for cg, code, n in window_rows:
            cl = _cluster_key(cg)
            bucket = agg.setdefault(cl, {"total": 0, "PA": 0, "PR": 0})
            n_int = int(n or 0)
            bucket["total"] += n_int
            if code == "PA":
                bucket["PA"] += n_int
            elif code == "PR":
                bucket["PR"] += n_int

        if cluster:
            agg = {k: v for k, v in agg.items() if k == cluster}

        # === 12-month monthly sparkline: anchor month back 11.
        first_month = _sub_months(anchor.replace(day=1), 11)
        sparkline_rows = db.execute(_sql_text(
            """
            SELECT commodity_group,
                   rejection_code,
                   year,
                   month,
                   COUNT(*) AS n
              FROM quotes
             WHERE date >= :first_month
               AND date <= :anchor
               AND commodity_group IS NOT NULL
             GROUP BY commodity_group, rejection_code, year, month
            """
        ), {"first_month": first_month, "anchor": anchor}).fetchall()

        # cluster -> month-key -> {"total": n, "PA": n, "PR": n}
        spark: dict[str, dict[str, dict[str, int]]] = {}
        for cg, code, y, mo, n in sparkline_rows:
            cl = _cluster_key(cg)
            if cluster and cl != cluster:
                continue
            mk = f"{int(y):04d}-{int(mo):02d}"
            cl_bucket = spark.setdefault(cl, {})
            mo_bucket = cl_bucket.setdefault(mk, {"total": 0, "PA": 0, "PR": 0})
            n_int = int(n or 0)
            mo_bucket["total"] += n_int
            if code == "PA":
                mo_bucket["PA"] += n_int
            elif code == "PR":
                mo_bucket["PR"] += n_int

        # Build the 12 month-keys we want to emit (oldest → newest).
        month_keys: list[str] = []
        for i in range(11, -1, -1):
            month_keys.append(_month_key(_sub_months(anchor.replace(day=1), i)))

        rows: list[dict[str, Any]] = []
        for cl, bucket in sorted(agg.items()):
            total = bucket["total"]
            pa = bucket["PA"]
            pr = bucket["PR"]
            pa_pct = (pa / total * 100.0) if total else 0.0
            pr_pct = (pr / total * 100.0) if total else 0.0

            cl_spark = spark.get(cl, {})
            sparkline: list[dict[str, Any]] = []
            for mk in month_keys:
                mo_bucket = cl_spark.get(mk)
                if mo_bucket and mo_bucket["total"]:
                    t = mo_bucket["total"]
                    sparkline.append({
                        "month": mk,
                        "paPct": round(mo_bucket["PA"] / t * 100.0, 2),
                        "prPct": round(mo_bucket["PR"] / t * 100.0, 2),
                    })
                else:
                    sparkline.append({"month": mk, "paPct": 0.0, "prPct": 0.0})

            rows.append({
                "cluster": cl,
                "paPct": round(pa_pct, 2),
                "prPct": round(pr_pct, 2),
                "sample": int(total),
                "monthlySparkline": sparkline,
            })

        return {
            "window": {"days": window_days, "anchor": anchor.isoformat()},
            "rows": rows,
        }
    except Exception as exc:  # pragma: no cover - schema-mismatch safety net
        _log.warning("win_loss compose failed: %s", exc)
        return empty
