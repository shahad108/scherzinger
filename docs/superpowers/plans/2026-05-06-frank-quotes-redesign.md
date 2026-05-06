# Frank Quotes & Guardrails — Re-skin Plan

**Goal:** Re-skin `#screen-quotes` (lines ~5599–6365) to Pryzm 2026 design language. Preserve all data, briefing memo, escalation cards, table, drill-downs, JS handlers.

**Reference:** Action Center, Forecast, Margin patterns. All scoped under `body.pryzm-2026 #screen-quotes`.

## Sections
A. Page head + filter chips + briefing button → crumbs + page-head + sub-pills + head-pill row
B. Briefing memo → `.lq-card` collapsible mirror of margin briefing
C. Pipeline at-risk strip (4 counters) → `.trust-grid` of 4 .trust-tile (active quotes / pipeline value / margin at risk amber / red 4 alert)
D. What changed since Monday → `.lq-card` with fact-list (mirror margin .ms-shifted)
E. Today's escalation queue (4 escalation cards) → `.lq-card` outer + concentration callout + bulk-accept bar + 4 `.action-card`-style rows
F. Pipeline funnel + aging → `.lq-card` with horizontal funnel viz
G. Guardrail thresholds → `.lq-card` with editable threshold rows
H. Active quotes table (47 sample 6) → `.sku-card` + `.frank-table` (R/A/G status pills)
I. Quote analysis (By rep / By SKU / By customer drill-downs) → `.lq-card` with `.fc-tabs` + 3 panes
Cross-links footer → `.lq-card` head-pill row

## Tasks
- **Q1**: A + B + C + D
- **Q2**: E + F + G
- **Q3**: H + I + cross-links + QA
