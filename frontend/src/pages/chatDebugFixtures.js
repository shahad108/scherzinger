export const FIXTURES = {
  narrative: { blocks: [
    { type: 'narrative', text: 'Neutral lead-in.' },
    { type: 'narrative', text: 'An insightful framing.', tone: 'insight' },
    { type: 'narrative', text: 'Something worth flagging.', tone: 'warning' },
  ]},
  metric_tile: { blocks: [
    { type: 'metric_tile', label: 'Customer 101580 LTV', value: '€726,128', delta: '+12%', deltaDirection: 'up', caption: 'High-value enterprise account.' },
  ]},
  metric_grid: { blocks: [
    { type: 'metric_grid', tiles: [
      { label: 'Revenue', value: '€4.2M' },
      { label: 'Orders', value: 183, delta: '+8%', deltaDirection: 'up' },
      { label: 'Win Rate', value: '62%', delta: '-3pp', deltaDirection: 'down' },
      { label: 'DB2 Margin', value: '65.1%' },
    ]},
  ]},
  comparison_cards: { blocks: [
    { type: 'narrative', text: 'Both customers sit at 0.62 churn risk but for very different reasons.', tone: 'insight' },
    { type: 'comparison_cards',
      subjects: [
        { id: '101580', label: 'Customer 101580', entityType: 'customer' },
        { id: '104053', label: 'Customer 104053', entityType: 'customer' },
      ],
      metrics: [
        { key: 'ltv', label: 'LTV', values: [726128, 675612], format: 'currency' },
        { key: 'win', label: 'Win Rate', values: [0.78, 0.33], format: 'percent' },
        { key: 'margin', label: 'DB2 Margin', values: [0.678, 0.645], format: 'percent' },
      ],
      caption: '101580 converts well but rarely quotes; 104053 quotes often but loses.'
    },
  ]},
  ranked_list: { blocks: [
    { type: 'ranked_list', items: [
      { id: '101580', label: 'Customer 101580', entityType: 'customer', primary: { label: 'LTV', value: 726128, format: 'currency' }, badge: { text: '0.62', tone: 'critical' } },
      { id: '104053', label: 'Customer 104053', entityType: 'customer', primary: { label: 'LTV', value: 675612, format: 'currency' }, badge: { text: '0.62', tone: 'critical' } },
      { id: '109221', label: 'Customer 109221', entityType: 'customer', primary: { label: 'LTV', value: 412000, format: 'currency' }, badge: { text: '0.48', tone: 'warning' } },
    ], caption: 'Sorted by churn probability.' },
  ]},
  factor_breakdown: { blocks: [
    { type: 'factor_breakdown',
      factors: [
        { label: 'Order recency', weight: 0.218, status: 'critical', detail: 'Only 13 invoices in the full period — extremely low touchpoint frequency for a €726K customer.' },
        { label: 'Quote win rate', weight: 0.112, status: 'weak', value: '33%', detail: 'Losing 2 of every 3 quotes — **price or fit mismatch**.' },
        { label: 'Margin trend', weight: 0.175, status: 'stable' },
        { label: 'Product breadth', weight: 0.142, status: 'moderate' },
      ]},
  ]},
  chart: { blocks: [
    { type: 'chart', variant: 'line', title: 'Monthly revenue', series: [
      { name: 'Revenue', data: [{x:'Jan',y:80},{x:'Feb',y:72},{x:'Mar',y:91},{x:'Apr',y:88},{x:'May',y:105}] },
    ], caption: 'Up 31% YoY.' },
    { type: 'chart', variant: 'bar', title: 'Top segments', series: [
      { name: 'Revenue', data: [{x:'Enterprise',y:2.1},{x:'SMB',y:1.4},{x:'Public',y:0.7}] },
    ]},
    { type: 'chart', variant: 'donut', title: 'Revenue mix', series: [
      { name: 'Mix', data: [{x:'Widgets',y:42},{x:'Services',y:31},{x:'Parts',y:18},{x:'Other',y:9}] },
    ]},
  ]},
  callout: { blocks: [
    { type: 'callout', tone: 'insight', text: 'Three enterprise accounts account for 46% of total LTV.' },
    { type: 'callout', tone: 'warning', text: 'Customer 101580 hasn\'t invoiced in 6 months.' },
    { type: 'callout', tone: 'success', text: 'Margin recovered to 65% this quarter.' },
  ]},
  action_plan: { blocks: [
    { type: 'action_plan', actions: [
      { title: 'Re-engage 101580', priority: 'high', timeline: '30 days', impact: '€150K–300K', rationale: 'Low invoice count; a single project unlocks outsized value.' },
      { title: 'Audit 104053 lost quotes', priority: 'high', timeline: '45 days', impact: '€100K–200K' },
      { title: 'Assign dedicated AM', priority: 'medium', timeline: '60 days' },
    ]},
  ]},
  data_table: { blocks: [
    { type: 'data_table',
      columns: [
        { key: 'id', label: 'Customer' },
        { key: 'ltv', label: 'LTV', format: 'currency' },
        { key: 'risk', label: 'Risk' },
      ],
      rows: [
        { id: '101580', ltv: 726128, risk: 0.62 },
        { id: '104053', ltv: 675612, risk: 0.62 },
      ]},
  ]},
  clarification: { blocks: [
    { type: 'clarification', question: 'Which cut of churn would you like?', suggestions: ['Top 10 at-risk customers', 'Churn trend by segment', 'A specific customer\'s risk factors'] },
  ]},
};

export const REPLAY_STREAM = JSON.stringify(FIXTURES.comparison_cards);
