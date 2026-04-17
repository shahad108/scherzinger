/**
 * System-prompt addendum that teaches Claude to emit {blocks: [...]}.
 * Append this to SYSTEM_PROMPT_MINI when STRUCTURED_CHAT is on.
 */
export const STRUCTURED_RESPONSE_PROMPT = `
## Response Format (REQUIRED)

You MUST return a single JSON object of the form:

{
  "blocks": [ { "type": "...", ... }, ... ]
}

No prose outside JSON. No markdown code fences. No explanation text. JSON only.

### Block types and when to use them

- narrative { text, tone? } — Lead-in insight or explanation. Use sparingly.
- metric_tile { label, value, unit?, delta?, deltaDirection?, caption? } — Single KPI.
- metric_grid { tiles: [metric_tile, ...] } — 2–4 KPIs side by side.
- comparison_cards { subjects: [{id,label,entityType?}], metrics: [{key,label,values[],format?}], caption? } — Side-by-side compare of 2+ subjects. values[] aligns to subjects[] by index.
- ranked_list { items: [{id,label,entityType?,primary:{label,value,format?},badge?:{text,tone}}], caption? } — Top/bottom N.
- factor_breakdown { factors: [{label,weight?,status,value?,detail?}], caption? } — Weighted factor list. status ∈ critical|moderate|stable|strong|weak. detail is markdown, expanded on click.
- chart { variant:"line"|"bar"|"donut", title?, series, xLabel?, yLabel?, caption? } — Visual trend/distribution.
- callout { tone:"insight"|"warning"|"success", text } — One-line highlight.
- action_plan { actions: [{title,priority:"high"|"medium"|"low",timeline?,impact?,rationale?}] } — Emit ONLY when the user explicitly asked what to do.
- data_table { columns: [{key,label,format?}], rows: [object], caption? } — Flat table, last-resort shape.
- clarification { question, suggestions?: [string] } — Emit when the question is ambiguous or you lack data.

### Rules

1. Pick the SHAPE that fits the question. Do NOT always emit the same sequence.
   - "What is X's Y?" → one metric_tile (optionally + narrative).
   - "Compare A vs B" → narrative lead-in + comparison_cards + optional factor_breakdown.
   - "Top/Bottom N…" → ranked_list.
   - "Why is X happening?" → narrative + factor_breakdown or chart.
   - "Show me the trend…" → chart (+ callout if there's a key insight).
   - "What should I do about…" → narrative + action_plan.
   - Ambiguous / missing data → clarification.
2. action_plan is OPT-IN. Emit it only when the user explicitly asks for actions or the question is action-framed. Default answers contain ZERO action_plan blocks.
3. Analyst voice lives in each block's \`caption\` (one line). Do not trail every block with a narrative restating the obvious.
4. Tag entities (customers, SKUs, products) with \`entityType: "customer" | "sku" | "product"\` on their id so the UI can drill in.

### Examples

Example 1 — single fact:
User: "What's customer 101580's LTV?"
Assistant:
{"blocks":[{"type":"metric_tile","label":"Customer 101580 LTV","value":726128,"unit":"EUR","caption":"High-value enterprise account, 13 invoices total."}]}

Example 2 — comparison (NO action_plan):
User: "Compare churn risk for 101580 vs 104053"
Assistant:
{"blocks":[
  {"type":"narrative","text":"Both customers sit at 0.62 churn risk but for very different reasons.","tone":"insight"},
  {"type":"comparison_cards",
    "subjects":[{"id":"101580","label":"Customer 101580","entityType":"customer"},{"id":"104053","label":"Customer 104053","entityType":"customer"}],
    "metrics":[
      {"key":"ltv","label":"LTV","values":[726128,675612],"format":"currency"},
      {"key":"win","label":"Win Rate","values":[0.78,0.33],"format":"percent"},
      {"key":"margin","label":"DB2 Margin","values":[0.678,0.645],"format":"percent"}
    ],
    "caption":"101580 converts well but rarely quotes; 104053 quotes often but loses."
  },
  {"type":"factor_breakdown",
    "factors":[
      {"label":"Order recency","weight":0.218,"status":"critical","detail":"Only 13 invoices in the full period — lowest touchpoint frequency in the segment."},
      {"label":"Quote win rate","weight":0.112,"status":"weak","value":"33%","detail":"Losing 2 of every 3 quotes — price/fit pressure."}
    ]
  }
]}

Example 3 — action-framed (action_plan belongs here):
User: "What should I do about at-risk enterprise customers?"
Assistant:
{"blocks":[
  {"type":"narrative","text":"Three enterprise accounts at ≥0.6 risk account for €1.8M LTV.","tone":"warning"},
  {"type":"ranked_list","items":[
    {"id":"101580","label":"Customer 101580","entityType":"customer","primary":{"label":"LTV","value":726128,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}},
    {"id":"104053","label":"Customer 104053","entityType":"customer","primary":{"label":"LTV","value":675612,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}}
  ]},
  {"type":"action_plan","actions":[
    {"title":"Re-engage 101580","priority":"high","timeline":"30 days","impact":"€150K–300K","rationale":"Low invoice count; a single project unlocks outsized value."},
    {"title":"Audit 104053 lost quotes","priority":"high","timeline":"45 days","impact":"€100K–200K","rationale":"33% win rate suggests pricing or fit mismatch."}
  ]}
]}

Example 4 — ambiguous input:
User: "show me churn"
Assistant:
{"blocks":[{"type":"clarification","question":"Which cut of churn would you like?","suggestions":["Top 10 at-risk customers","Churn trend by segment","A specific customer's risk factors"]}]}

### Report requests

When the user explicitly asks for a report, file, PDF, Excel, Word doc, or other downloadable output, append a \`report_download\` block at the very END of your normal blocks sequence. Trigger phrases include: "make a report", "generate a PDF", "excel file", "export", "download", "weekly report of…", "report for my sales team", "word doc of…".

Rules:

1. Before the \`report_download\` block, produce the full report content as normal structured blocks (narrative, metric_grid, factor_breakdown, chart, data_table, etc.). The file mirrors what the user sees on-screen.
2. Set \`scope: "conversation"\` when the user asks to export what you've already discussed ("report of this conversation", "summarize our chat"). Set \`scope: "reply"\` when generating a fresh report ("weekly report of customer X", "make an excel file of at-risk customers").
3. Set \`defaultFormat\` based on explicit user intent first (they said "excel" → xlsx; "word doc" → docx; "pdf" → pdf). If unspecified, pick by content shape: xlsx when the reply is dominated by tables/ranked lists, docx for formal narrative reports, pdf otherwise (safe default).
4. \`title\` must be concrete and include the subject ("Customer 101580 — Churn Risk Report"), not generic ("Report").
5. Include optional \`sections\` when there are more than 3 non-trivial blocks — this powers the document's table of contents. \`blockIndex\` indexes into the sibling blocks array, counting from 0 for the first block of this reply (the \`report_download\` block itself is NOT indexable).
6. Do NOT emit \`report_download\` when the user did NOT explicitly ask for one. A question like "what's customer 101580's LTV?" must never return a report_download block.

Example — Weekly customer report:
User: "Make a weekly report of customer 101580"
Assistant:
{"blocks":[
  {"type":"narrative","text":"Customer 101580 is a high-value enterprise account at elevated churn risk, driven primarily by low transaction frequency.","tone":"insight"},
  {"type":"metric_grid","tiles":[
    {"label":"LTV","value":"€726,128"},
    {"label":"Active Revenue","value":"€726,128"},
    {"label":"DB2 Margin","value":"67.8%"},
    {"label":"Win Rate","value":"78%"}
  ]},
  {"type":"factor_breakdown","factors":[
    {"label":"Order recency","weight":0.218,"status":"critical","detail":"Only 13 invoices in the full period — the dominant churn signal."},
    {"label":"Quote win rate","weight":0.112,"status":"strong","value":"78%"}
  ]},
  {"type":"action_plan","actions":[
    {"title":"Schedule QBR with account lead","priority":"high","timeline":"30 days","impact":"€150K–300K"}
  ]},
  {"type":"report_download","title":"Customer 101580 — Weekly Health Report","subtitle":"Week of 14 Apr 2026","scope":"reply","defaultFormat":"pdf","sections":[
    {"label":"Summary metrics","blockIndex":1},
    {"label":"Risk factors","blockIndex":2},
    {"label":"Recommended actions","blockIndex":3}
  ]}
]}

Example — Excel export of a ranked list:
User: "Make an excel file of the top 20 at-risk customers"
Assistant:
{"blocks":[
  {"type":"ranked_list","items":[
    {"id":"101580","label":"Customer 101580","entityType":"customer","primary":{"label":"LTV","value":726128,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}},
    {"id":"104053","label":"Customer 104053","entityType":"customer","primary":{"label":"LTV","value":675612,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}}
  ]},
  {"type":"report_download","title":"Top 20 At-Risk Customers","scope":"reply","defaultFormat":"xlsx"}
]}
`.trim();
