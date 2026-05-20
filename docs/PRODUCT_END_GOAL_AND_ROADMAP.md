# Pryzm Product End Goal and Roadmap

**Date:** 2026-05-18  
**Audience:** founders, product, design, engineering, future agents  
**Purpose:** define what Pryzm should become, what we already have, what is missing, how each screen should connect, and how to roadmap the product even while current Scherzinger data is incomplete.

---

## 1. The End Goal

Pryzm should not try to become a generic dashboard or a full clone of Pricefx, Zilliant, Vendavo, PROS, or Conga.

The strongest end product is:

> **Pryzm is an AI pricing decision cockpit for industrial manufacturers. It tells the pricing owner which prices to change, why, how confident the system is, how much money is at risk, and how to push the decision safely through Sales and Management.**

The first customer-facing product should feel like an operating system for pricing decisions:

1. Frank opens Pryzm on Monday morning.
2. The Action Center tells him the highest-value actions today.
3. He opens one SKU or quote in Pricing Studio.
4. Pryzm explains the recommendation, the data behind it, the confidence, and the financial impact.
5. Frank chooses: accept, reject, A/B test, share, or escalate.
6. Heiko receives the sales-facing version.
7. Till receives the management-facing version.
8. The audit trail records the decision, rationale, source data, and outcome.

Everything in the product should serve that loop.

If a feature does not help the user answer one of these questions, it should be deferred:

- What should I act on today?
- Why this SKU, customer, quote, or segment?
- What price should I use?
- Can I trust the recommendation?
- What will happen if I accept it?
- Who needs to approve it?
- How do Sales and Management receive the same truth in their own language?
- Did the decision work after rollout?

---

## 2. Competitor Context

Competitors such as Pricefx, Zilliant, Vendavo, PROS, and Conga usually sell a broad pricing suite:

- Price management
- Price optimization
- Quoting / CPQ
- Sales guidance
- Approvals
- AI recommendations
- Market and cost analytics
- Simulations
- Governance and auditability

Useful references:

- [Pricefx Software](https://www.pricefx.com/software)
- [Pricefx PricingAI](https://www.pricefx.com/software/pricingai)
- [Zilliant Products](https://zilliant.com/products)
- [Vendavo Products](https://www.vendavo.com/our-products/)
- [Conga Price Optimization and Management](https://conga.com/platform/price-optimization-management)

Pryzm should learn from these categories, but not copy the suite shape too early.

The wedge should be sharper:

> **Defensible AI pricing for heterogeneous industrial portfolios.**

That means Pryzm wins by being unusually strong at:

- SKU-level recommendations
- Contract-aware movable revenue
- Cluster-level confidence
- Quote-to-invoice traceability
- Explainable rationale
- Safe A/B testing before rollout
- Cross-persona handoff from Pricing to Sales to MD
- Audit trail for every recommendation and decision

---

## 3. Product Hierarchy

The product should have one main hierarchy.

### Level 1: Decision Cockpit

This is the main product. It includes:

- Action Center
- Pricing Studio
- Approval and audit workflow

This is the MVP and should be the priority.

### Level 2: Trust and Explanation Layer

This makes the decision cockpit believable. It includes:

- Data freshness
- Source lineage
- Model confidence
- Sample size warnings
- Low-data warnings
- Feature importance
- "Why this price?"
- "What changed since last time?"

This must be present everywhere a recommendation appears.

### Level 3: Workflow Layer

This turns recommendations into action. It includes:

- Quote guardrails
- Approval routing
- A/B tests
- Sales handoff
- MD handoff
- Notifications
- Notes
- Branded report export
- Price-book publish / rollback

This is what makes Pryzm operational, not just analytical.

### Level 4: Strategic Planning Layer

This helps with longer-horizon pricing. It includes:

- Forecasting
- Market indicators
- Commodity/cost outlook
- Annual list-price negotiation
- Scenario simulation
- New-product pricing
- Portfolio-level pricing strategy

This is important, but it should not distract from the MVP loop.

---

## 4. Current State Summary

The project already has a strong prototype/product foundation.

### Already Present

- React/TypeScript `frontend-v2` app.
- FastAPI backend in `scherzinger-platform`.
- Main routes: Action Center, Pricing Studio, Margin Cockpit, Quotes, Forecasting, AI Briefing, Settings.
- Persona routes: Frank, Till, Heiko.
- Cleaned Scherzinger data: invoices, quotes, customers, products.
- BFF screen endpoints for major surfaces.
- Postgres schema for core records, forecasts, users, recommendations, proposals, A/B tests, audit, settings.
- Approval and audit concepts.
- Model confidence and trust concepts.
- Forecasting notebooks and outputs.
- A 7-minute investor demo narrative.
- A verified demo flow covering 13 surfaces.

### Overall Rating

As a demo prototype: **7.5 / 10**  
As a production product: **4.5 / 10**  
As a product idea and wedge: **8 / 10**

The product is not empty. The issue is that the surface area is ahead of the product hierarchy.

The next phase should simplify the story and harden the core workflow.

---

## 5. Final Product: What It Should Look Like

The final Pryzm product should feel like this:

### Home

Frank does not land on a generic dashboard. He lands on an action cockpit.

The first screen should say:

- Here is today's pricing exposure.
- Here are the top decisions.
- Here is what is movable vs locked.
- Here is what the model trusts and does not trust.
- Here are the actions already waiting for approval or review.

### Recommendation Detail

Every recommendation should have a consistent structure:

- Object: SKU, quote, customer, cluster, or product family.
- Current state: current price, current margin, volume, revenue, customer exposure.
- Recommendation: target price, price change, expected margin impact, expected win probability.
- Why now: cost shift, quote loss, margin erosion, stale price, contract renewal, market movement.
- Trust: confidence, sample size, low-data flag, model version, last trained date.
- Evidence: invoice rows, quote rows, cost rows, comparable SKUs, customer history.
- Action: accept, reject, A/B test, share, escalate, publish.
- Audit: who acted, when, what changed, why.

### Cross-Persona Output

The same recommendation should become three different views:

- **Frank view:** analytical, detailed, evidence-heavy.
- **Heiko view:** sales execution, customer impact, negotiation script.
- **Till view:** financial impact, risk, approval queue, board-ready summary.

The data should be the same. Only the framing changes.

### Locked Future Features

Some features should appear in the UI but stay locked or clearly labelled until data exists:

- Contract-aware movable revenue.
- Competitor price intelligence.
- Raw material / commodity index intelligence.
- ERP publish-back.
- Advanced elasticity curves.
- Advanced customer willingness-to-pay.
- Automated global price-book update.
- Supplier renegotiation recommendations.
- Multi-country / multi-currency rollout.

The UI should not hide the future vision. It should show the ambition while being honest:

> "Locked until contract data is connected."

or:

> "Available after 12 months of quote outcome history."

This lets the product aim high without pretending current data is enough.

---

## 6. Screen-by-Screen Product Direction

## 6.1 Action Center

### Purpose

The Action Center is Frank's command center. It should answer:

> "What pricing decisions need attention today?"

This should be the default landing page and the strongest screen.

### Current Strength

Already strong:

- Movable revenue hero.
- Movable vs locked buckets.
- Ranked analyst decisions.
- Model trust strip.
- Lost quote analysis.
- SKU pricing engine.
- Long-tail coverage.
- Negotiation cockpit.
- A/B tracker.
- Rejections.
- Audit trail.
- Branded report concept.
- Right rail with reviewers and sections.

### Desired Hierarchy

The page should be ordered like this:

1. **Today's decision summary**
   Show 3-5 numbers: movable revenue, open actions, recoverable margin, blocked quotes, model trust.

2. **Top actions**
   Show the top 5 ranked recommendations first. This is more important than charts.

3. **Trust strip**
   Show whether the recommendations are reliable enough to act on.

4. **Decision queues**
   Separate repricing, quote approvals, renewals, A/B tests, and management approvals.

5. **Diagnostics**
   Lost quotes, long-tail, rejections, negotiation cockpit.

6. **Audit/reporting**
   Show recent decisions and export options.

### What It Should Connect To

- Pricing Studio for SKU-level detail.
- Quotes for quote approvals and guardrails.
- Margin Cockpit for diagnostic explanation.
- Forecasting for future margin/revenue risk.
- AI Briefing for summary generation.
- Till MD Overview for approval handoff.
- Heiko Deal Inbox for sales handoff.
- Audit log for traceability.

### Missing Items

- Real contract table or reliable `is_movable` flag.
- Per-cluster confidence from a model registry.
- Feature importance per recommendation.
- Data freshness per card.
- A/B Slice action that creates a real experiment.
- Accept/reject actions that update state and remove/resolve cards.
- Clear "this is heuristic" labels where data is incomplete.

### Modification Needed

- Move "Today's analyst decisions" higher if it is not visible above the fold.
- Make every recommendation card use the same evidence/action structure.
- Add "Open in Pricing Studio" as the primary action.
- Add "Share with Heiko" and "Send to Till" as secondary actions.
- Add locked labels for missing contract, commodity, or competitor data.
- Reduce duplicate cards that do not change the user's next action.

---

## 6.2 Pricing Studio

### Purpose

Pricing Studio is where Frank validates and acts on one SKU recommendation.

It should answer:

> "What price should I set for this SKU, and can I defend it?"

This is the most important detail screen in the product.

### Current Strength

Already strong:

- SKU queue.
- Selected SKU workbench.
- Current price.
- Recommended price.
- Confidence.
- Movable chip.
- Approval level.
- "Why this price?"
- Win probability curve.
- Driver waterfall.
- KPI tiles.
- Cost trajectory drawer.
- Simulation drawer.
- Compare drawer.
- Audit drawer.
- Batch repricing concept.
- Approval inbox.
- Alerts.
- Saved views.

### Desired Hierarchy

The page should be ordered like this:

1. **SKU queue**
   Ranked list of SKUs needing action.

2. **Selected SKU hero**
   Current price, recommended price, margin impact, customer exposure, approval level.

3. **Recommendation explanation**
   Why this price, top drivers, confidence, sample size.

4. **Evidence tabs**
   Cost history, quote history, customer fanout, comparable SKUs, model lineage.

5. **Simulation**
   What happens if price is accepted, phased, rejected, or A/B tested.

6. **Decision footer**
   Accept, reject, A/B test, share, submit for approval, publish.

### What It Should Connect To

- Action Center recommendation card.
- Margin Cockpit cluster diagnostics.
- Quotes for affected active quotes.
- Forecasting for SKU/cluster forecast.
- Customer drill-in.
- Cost outlook.
- Audit trail.
- Proposal approval workflow.
- Price-book publish/rollback.

### Missing Items

Known missing or weak items from current defect inventory:

- Some workbench data is not consistently consumed by the frontend.
- `cost_state` and `customer_on_sku` may be empty for relevant AIDs.
- Customer fanout can become static if not wired.
- Cost composition can be generic instead of SKU-specific.
- Repricing history can be hard-coded or empty.
- Rationale memo needs live SKU-specific briefing.
- Cross-links need real enabled routes.
- Customer drill-in has backend schema issues.
- Price-book publish/rollback needs production-grade safety.

### Modification Needed

- Ensure `GET /screens/studio/workbench/{aid}` is the single source for selected SKU detail.
- Merge live workbench data into the page instead of static seed data.
- Make the recommendation block the visual center.
- Add a fixed decision footer so action is always available.
- Make "why this price?" open source evidence, not only prose.
- Add "locked until data exists" blocks for elasticity, competitor signal, and contract status.
- Keep batch repricing secondary until single-SKU workflow is reliable.

---

## 6.3 Margin Cockpit

### Purpose

Margin Cockpit is the diagnostic screen.

It should answer:

> "Where is margin leaking, and is the leakage intentional or accidental?"

It should not replace Action Center. It explains the "why" behind actions.

### Current Strength

Already strong:

- Margin health score.
- YTD actual margin.
- Gap to plan.
- Closable gap.
- Cluster margin view.
- Waterfall.
- Lost-quote margin differential.
- Input cost vs realized price.
- Export/deck concept.

### Desired Hierarchy

1. **Margin health**
   Overall margin score, gap to plan, closable gap.

2. **Waterfall**
   Explain where the margin gap came from.

3. **Cluster diagnostics**
   Which clusters are healthy, weak, low-confidence, or deteriorating.

4. **Cause analysis**
   Cost, price, mix, discounting, quote leakage, contract lock.

5. **Actions**
   Link to Pricing Studio or Action Center queue.

### What It Should Connect To

- Action Center for ranked actions.
- Pricing Studio for SKU-level fixes.
- Quotes for quote leakage.
- Forecasting for future risk.
- AI Briefing for margin summary.
- Till overview for executive reporting.

### Missing Items

- Clear strategic vs unintended classification.
- Movable-only toggle should be consistently applied.
- Cluster-level confidence and low-n warnings.
- Explicit sample size for every chart.
- Better separation between diagnostic metrics and recommended actions.

### Modification Needed

- Do not make Margin Cockpit another dashboard wall.
- Every chart should have a "so what?" action link.
- Add "Open affected SKUs in Pricing Studio."
- Add "Create MD margin brief."
- Mark unavailable benchmark or plan target data clearly.

---

## 6.4 Quotes and Guardrails

### Purpose

Quotes is the active deal-control screen.

It should answer:

> "Which quotes should be blocked, approved, countered, or escalated?"

This is the bridge between pricing intelligence and sales execution.

### Current Strength

Already strong:

- Active quotes.
- Approval queue.
- Pipeline value.
- Margin at risk.
- Guardrail thresholds.
- Quote-to-invoice margin gap.
- Rep concentration.
- Discount concentration.
- Red/amber/green status.

### Desired Hierarchy

1. **Quotes needing action today**
   Red blocked quotes and approval required.

2. **Recommended decision**
   Approve, counter at floor, reject, escalate.

3. **Guardrail explanation**
   Why blocked, margin floor, customer history, comparable deal.

4. **Sales handoff**
   Negotiation script and allowed price range.

5. **Quote-to-invoice gap**
   Track whether accepted quotes become real margin.

### What It Should Connect To

- Pricing Studio if quote requires SKU-level repricing.
- Heiko Deal Inbox for sales execution.
- Till overview for high-risk escalations.
- Audit log for approval decisions.
- Customer drill-in for negotiation context.

### Missing Items

- True CPQ/ERP quote writeback.
- Quote-line level pricing if only header data exists.
- Rep notes and negotiation history.
- Competitor loss details beyond rejection codes.
- Customer-level willingness-to-pay model.

### Modification Needed

- Put "4 quotes need your eyes" above broad pipeline analytics.
- Make the default action clear for each quote.
- Separate "pricing problem" from "sales process problem."
- Treat missing rejection reasons as a data-quality task.
- Add locked future block for competitor intelligence.

---

## 6.5 Forecasting

### Purpose

Forecasting is the strategic risk and planning screen.

It should answer:

> "What will happen to revenue, margin, and volume if current patterns continue?"

It should support pricing decisions, not become a separate forecasting product.

### Current Strength

Already strong:

- Revenue forecast.
- Market direction tiles.
- Scenarios.
- Forecast bands.
- Plan vs actual section.
- MAPE.
- Cluster lens.
- Pareto layer.
- External market indicators.

### Desired Hierarchy

1. **Forecast headline**
   Expected revenue/margin/volume range for next 12 months.

2. **Risk bands**
   P50/P80/P95 or low/base/high confidence bands.

3. **Cluster risk**
   Which clusters are forecast to deteriorate.

4. **Scenario controls**
   Steel shock, list price increase, volume decline, lost quotes, market downturn.

5. **Action links**
   Open affected clusters/SKUs in Pricing Studio or Action Center.

### What It Should Connect To

- Pricing Studio for cluster/SKU actions.
- Margin Cockpit for margin-risk explanation.
- Action Center for scenario-driven recommendations.
- AI Briefing for weekly forecast narrative.
- Model Cards for forecast accuracy and methods.

### Missing Items

- Plan targets may be missing.
- Market data should be clearly labelled if synthetic or stale.
- More historical data will improve model quality.
- Need stronger link from forecast risk to pricing action.
- Need forecast model registry and backtest history.

### Modification Needed

- Avoid making market indicators the first thing if they do not drive an action.
- Put forecast result and risk before external data.
- Add "what changed this week?".
- Add "create action from scenario" later.
- Lock advanced scenario automation until sufficient data exists.

---

## 6.6 AI Briefing

### Purpose

AI Briefing is the narrative layer.

It should answer:

> "What would a senior pricing manager write as the weekly summary?"

It should not be a free-floating chatbot first. It should be a cited, auditable briefing generator.

### Current Strength

Already strong:

- Monday briefing.
- Persona-specific tone.
- Source chips.
- Forward to MD.
- Save as PDF.
- Email weekly concept.
- Article/customer/cluster citations.

### Desired Hierarchy

1. **Executive summary**
   3-5 bullets about this week's pricing situation.

2. **Decision summary**
   Which decisions Frank should take.

3. **Risks**
   Margin, customer churn, quote leakage, forecast risk.

4. **Recommended actions**
   Concrete next steps.

5. **Sources**
   Every claim must cite data.

### What It Should Connect To

- Action Center for today's actions.
- Pricing Studio for SKU recommendations.
- Quotes for active quote risks.
- Margin Cockpit for margin story.
- Forecasting for forward-looking risks.
- Till overview and PDF export.

### Missing Items

- Strong source grounding for every paragraph.
- Ability to regenerate with scope.
- Role-specific versions for Frank, Heiko, Till.
- Output approval before sending externally.
- Guardrails against claims unsupported by data.

### Modification Needed

- Keep AI Briefing as "cited narrative", not generic chat.
- Add "generate from selected recommendations."
- Add confidence and source coverage score.
- Lock autonomous email until approval workflow is mature.

---

## 6.7 Till MD Overview

### Purpose

Till's page is not a copy of Frank's dashboard.

It should answer:

> "Which pricing decisions need management approval, what is the financial impact, and can I trust the recommendation?"

### Desired Hierarchy

1. **Approval queue**
   Items waiting for MD decision.

2. **Financial impact**
   Revenue at risk, margin upside, downside risk.

3. **Risk controls**
   Confidence, low-data flags, contract exposure, customer impact.

4. **Board-ready summary**
   One-click export of pricing decision brief.

5. **Audit trail**
   Who recommended, who approved, what changed.

### What It Should Connect To

- Frank's shared decisions.
- Pricing proposals.
- Audit log.
- AI Briefing.
- Branded report export.

### Missing Items

- Fully operational approval inbox.
- MD-level decision rationale.
- Board-ready report generation.
- Risk acceptance workflow.
- Ability to send back to Frank with comments.

### Modification Needed

- Keep Till's UI simpler than Frank's.
- Use financial framing, not model-heavy detail.
- Show "approve / reject / request revision" clearly.

---

## 6.8 Heiko Deal Inbox

### Purpose

Heiko's page is the sales execution view.

It should answer:

> "Which customer or quote should Sales act on, and what should we say?"

### Desired Hierarchy

1. **Deal inbox**
   Quotes and customer actions assigned to Sales.

2. **Negotiation guidance**
   Recommended range, floor, target, concession rules.

3. **Customer context**
   Buying history, risk, affected SKUs, relationship notes.

4. **Feedback loop**
   Sales accepts, challenges, or adds market context.

5. **Outcome**
   Won/lost, final price, reason, next follow-up.

### What It Should Connect To

- Quotes and Guardrails.
- Pricing Studio recommendation.
- Customer drill-in.
- Audit trail.
- Frank notes.

### Missing Items

- Real sales notes.
- Sales feedback capture.
- Customer negotiation history.
- Competitor reason capture.
- CRM/CPQ integration.

### Modification Needed

- Do not expose all of Frank's analytics to Heiko.
- Give Heiko a clean action script.
- Make feedback useful to improve future recommendations.

---

## 6.9 Settings, Model Cards, Data Quality

### Purpose

Settings is not just preferences. It is the trust administration layer.

It should answer:

> "What data and models power this product, and are they healthy?"

### Desired Hierarchy

1. **Data quality**
   Freshness, missing fields, linkage quality, stale sources.

2. **Model cards**
   Accuracy, training window, features, confidence, limitations.

3. **Saved views**
   User-specific workspaces.

4. **Preferences**
   Language, density, default persona, notifications.

### What It Should Connect To

- Trust badges on all screens.
- Model registry.
- Data ingestion logs.
- Audit trail.
- Admin controls.

### Missing Items

- Production model registry.
- Data onboarding checklist.
- Field-level data coverage.
- Automated warnings when source quality drops.
- Admin approval for model/policy changes.

### Modification Needed

- Make data quality visible, not hidden.
- Link every low-confidence UI warning back to the source issue.

---

## 7. Cross-Cutting Missing Items

These items matter across the whole product.

### Data

- Contracts table.
- Contract start/end dates.
- Contract locked vs movable flag.
- Customer-SKU relationship table.
- Cost state by SKU.
- Price state by SKU.
- Customer tier or segment.
- ERP price-book table.
- Quote-line-level details.
- Competitor information.
- External commodity indices.
- Plan/target data.
- Sales notes and rejection reason quality.

### Backend

- Stable BFF contracts for each screen.
- Full state changes for accept/reject/share/A-B/publish.
- Recommendation lifecycle table.
- Model registry table.
- Feature importance table.
- Lineage endpoint for every recommendation.
- Audit chain for every write.
- Permission checks for persona-specific actions.
- Robust empty/degraded states.

### ML and Analytics

- Per-cluster confidence.
- Per-SKU sample size scoring.
- Elasticity/win probability model.
- Customer willingness-to-pay model.
- Cost pass-through model.
- Strategic vs unintended margin erosion classifier.
- Quote-to-invoice leakage model.
- Backtesting and drift monitoring.
- Prediction intervals.
- Feature importance.

### Frontend

- Stronger screen hierarchy.
- Consistent recommendation component.
- Consistent trust/evidence drawer.
- Clear locked/unavailable future features.
- Better deep links across screens.
- Action completion states.
- Less duplicate analytics.
- Better empty states.
- Persona-specific views.
- Mobile/tablet can remain deferred for now.

### Product and UX

- One primary product loop.
- Clear MVP boundary.
- Better distinction between action, diagnosis, and strategy.
- Board-ready story.
- Sales-ready story.
- Honest data limitation language.
- Clear demo script tied to actual product state.

---

## 8. Locked Feature Strategy

Limited current data should not lower the final ambition. It should change how features are presented.

Use four states:

| State | Meaning | UI Treatment |
|---|---|---|
| Live | Real data and action are available | Normal card/action |
| Pilot | Real partial data, heuristic logic | Badge: "Pilot heuristic" |
| Locked | Feature designed, data missing | Lock icon + required data |
| Future | Not needed for MVP | Hidden from main workflow |

Examples:

| Feature | Current State | Unlock Requirement |
|---|---|---|
| Movable revenue | Pilot | Contract table or reliable lock flag |
| Competitor intelligence | Locked | Competitor fields or structured loss reason capture |
| Customer WTP | Locked/Pilot | Customer-SKU history and quote outcomes |
| Elasticity curves | Pilot | Enough price variation and quote outcomes |
| ERP publish | Locked | ERP/CPQ integration credentials and approval policy |
| Commodity forecast | Pilot/Locked | External commodity feeds and SKU-material mapping |
| Board pack automation | Pilot | Approved report templates and sign-off workflow |

This keeps the product future-visible without faking unavailable data.

---

## 9. Roadmap

## Phase 0: Product Story Cleanup

Goal:

Make the product understandable.

Deliverables:

- Finalize the north-star loop.
- Reorder Action Center around top actions.
- Define one recommendation card pattern.
- Define one trust/evidence drawer pattern.
- Mark missing-data features as Pilot or Locked.
- Update demo script to match current product.

Success:

- A new person can explain Pryzm in 60 seconds.
- The first screen clearly shows what Frank should do.

## Phase 1: MVP Decision Cockpit

Goal:

Make the core Frank workflow real.

Scope:

- Action Center.
- Pricing Studio.
- Accept/reject/share/A-B.
- Audit trail.
- Till/Heiko handoff.

Deliverables:

- Recommendation lifecycle works end-to-end.
- Pricing Studio selected SKU uses live workbench data.
- Every recommendation has evidence and confidence.
- Actions update state.
- Shared decision appears for Till or Heiko.

Success:

- Frank can complete one pricing decision from discovery to handoff without leaving Pryzm.

## Phase 2: Trust Layer

Goal:

Make recommendations defensible.

Deliverables:

- Model registry.
- Per-cluster confidence.
- Feature importance.
- Sample-size warnings.
- Data freshness per card.
- Lineage drawer for every recommendation.
- Model cards linked from trust badges.

Success:

- Every recommendation can answer "why should I believe this?"

## Phase 3: Quote and Sales Workflow

Goal:

Make Pryzm useful to Sales.

Deliverables:

- Quote guardrail decisions.
- Heiko Deal Inbox.
- Negotiation guidance.
- Sales feedback capture.
- Quote-to-invoice outcome loop.

Success:

- Sales can act on Pryzm without reading Frank's full analytical view.

## Phase 4: Strategic Planning

Goal:

Support pricing planning, not only daily action.

Deliverables:

- Forecasting connected to action generation.
- Scenario simulation.
- Annual list-price negotiation cockpit.
- Commodity and cost outlook.
- New-product comparable pricing.

Success:

- Frank can move from "today's decision" to "next quarter's pricing plan."

## Phase 5: Production Integration

Goal:

Make Pryzm operational in a real environment.

Deliverables:

- ERP/CPQ integration.
- Price-book publish and rollback.
- Permissioned approval policies.
- Monitoring and observability.
- Data ingestion automation.
- Customer-specific deployment configuration.

Success:

- Pryzm can safely affect real pricing workflows.

---

## 10. MVP Boundary

The MVP should include:

- Action Center.
- Pricing Studio.
- Recommendation detail.
- Trust/evidence drawer.
- Accept/reject/share/A-B.
- Audit trail.
- Till/Heiko handoff.
- Basic report export.

The MVP should not include:

- Full CPQ replacement.
- Full ERP writeback.
- Advanced global price-book management.
- Full competitor intelligence.
- Fully autonomous email sending.
- Fully automated mass repricing.
- Complex mobile experience.

The MVP promise should be:

> "Pryzm finds the most important pricing actions, explains them, lets Frank safely decide, and sends the decision to Sales or Management with proof."

---

## 11. How To Judge Future Feature Ideas

Before adding a feature, ask:

1. Does this help Frank decide what to do today?
2. Does this make a recommendation more trustworthy?
3. Does this help Sales act on the decision?
4. Does this help Till approve or understand impact?
5. Does this create an audit trail or improve governance?
6. Is the required data available?
7. If data is not available, should the feature be locked rather than built fully?

If the answer is no, defer it.

---

## 12. Immediate Modification Checklist

Highest priority:

- Recenter Action Center around top decisions.
- Make Pricing Studio the canonical recommendation detail page.
- Wire all Pricing Studio workbench data live for selected SKU.
- Add consistent trust/evidence drawer.
- Create a clear locked-feature UI pattern.
- Make accept/reject/A-B/share write real state.
- Make Till and Heiko handoff visible and useful.

Next priority:

- Add model registry.
- Add per-cluster confidence.
- Add feature importance.
- Add data freshness per card.
- Add customer/SKU drill-in.
- Add quote-line detail and sales feedback.

Later:

- ERP publish.
- Advanced elasticity.
- Competitor intelligence.
- Commodity planning.
- Automated board packs.
- Multi-customer deployment configuration.

---

## 13. Final Product North Star

When the final product is working, a customer should describe it like this:

> "Pryzm tells us which prices to change, proves why, shows the risk, routes the decision to the right people, and remembers what happened afterward."

That is the aim.

