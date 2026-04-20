import { formatEUR } from './formatters';

// Shared Insight shape:
// { badge, title, subtitle?, hero: {label, value, delta?, tone?}, stats: [{label,value,tone?}],
//   why: [string], chart?: {type, data}, actions: [{text, emphasis?}], related: [{label,type,id}] }

export function buildWTPInsight(row) {
  const headroomMid = row.midWTP - row.current;
  const headroomHigh = row.highWTP - row.current;
  const pctToMid = ((headroomMid / row.current) * 100).toFixed(1);
  const pctToHigh = ((headroomHigh / row.current) * 100).toFixed(1);
  const position =
    row.current <= row.lowWTP ? 'below the low band'
    : row.current <= row.midWTP ? 'inside the low-to-mid band'
    : row.current <= row.highWTP ? 'inside the mid-to-high band'
    : 'above the high band';

  return {
    badge: 'WTP',
    title: `Willingness-to-Pay — ${row.customer}`,
    subtitle: row.segment,
    hero: {
      label: 'Current price',
      value: `€${row.current}`,
      delta: headroomMid > 0 ? `+€${headroomMid} to mid · +€${headroomHigh} to high` : null,
      tone: headroomMid > 0 ? 'positive' : 'neutral',
    },
    stats: [
      { label: 'Current', value: `€${row.current}` },
      { label: 'Low WTP', value: `€${row.lowWTP}` },
      { label: 'Mid WTP', value: `€${row.midWTP}` },
      { label: 'High WTP', value: `€${row.highWTP}` },
    ],
    why: [
      `${row.customer} (${row.segment}) currently pays €${row.current}. That's ${position}.`,
      headroomMid > 0
        ? `There's €${headroomMid} (${pctToMid}%) of headroom to the midpoint. Customers in this segment typically accept increases of up to this size without pushback.`
        : `Price is already at or above the willingness-to-pay midpoint. Further increases risk account loss.`,
      headroomHigh > 0
        ? `Stretch target: €${row.highWTP} captures the full band (+${pctToHigh}%). Reserve for framework renewal or new-basket quotes.`
        : `Above the high band — consider holding steady and using value-adds (terms, delivery) as the next lever.`,
    ],
    chart: {
      type: 'band',
      data: { low: row.lowWTP, mid: row.midWTP, high: row.highWTP, current: row.current },
    },
    actions: [
      headroomMid > 0
        ? { text: `Raise price to €${row.midWTP} on next quote — low account-loss risk`, emphasis: 'primary' }
        : { text: 'Hold price; use delivery or payment terms as differentiator', emphasis: 'primary' },
      headroomHigh > 0
        ? { text: `Test €${row.highWTP} on framework renewal (stretch target)` }
        : { text: 'Monitor competitor quotes quarterly — small shifts matter here' },
      { text: `Flag ${row.customer} in next pricing review` },
    ],
    related: [],
  };
}

export function buildCLVInsight(row) {
  const retPct = Math.round(row.retentionProb * 100);
  const monthlyValue = Math.round(row.clv / Math.max(1, row.monthsActive));
  const tierNarrative = {
    platinum: 'Top decile of lifetime value. Any churn here moves the full-year forecast.',
    gold:     'High-value segment. Retention investment pays back fast.',
    silver:   'Solid mid-tier. Cross-sell potential likely underused.',
    bronze:   'Lower lifetime value. Focus on basket-expansion, not retention spend.',
  };
  const retentionNarrative = retPct >= 80
    ? `${retPct}% retention probability — stable account. Risk of churn in the next 12 months is low.`
    : retPct >= 60
    ? `${retPct}% retention probability — watch this account. A single competitor win could flip it.`
    : `${retPct}% retention probability — elevated churn risk. Intervention this quarter is warranted.`;

  return {
    badge: 'CLV',
    title: `Customer Lifetime Value — ${row.customer}`,
    subtitle: `${row.tier.toUpperCase()} tier · ${row.monthsActive} months active`,
    hero: {
      label: 'Lifetime value',
      value: formatEUR(row.clv),
      delta: `~${formatEUR(monthlyValue)}/month avg`,
      tone: row.tier === 'platinum' || row.tier === 'gold' ? 'positive' : 'neutral',
    },
    stats: [
      { label: 'CLV', value: formatEUR(row.clv) },
      { label: 'Tier', value: row.tier.toUpperCase() },
      { label: 'Retention', value: `${retPct}%`, tone: retPct >= 80 ? 'positive' : retPct >= 60 ? 'neutral' : 'negative' },
      { label: 'Months active', value: String(row.monthsActive) },
    ],
    why: [
      tierNarrative[row.tier] || 'Mid-tier account.',
      retentionNarrative,
      `Estimated monthly contribution: ${formatEUR(monthlyValue)}. Over the next 12 months, expected value at current retention is ~${formatEUR(Math.round(monthlyValue * 12 * row.retentionProb))}.`,
    ],
    chart: {
      type: 'clvDecomp',
      data: { clv: row.clv, monthlyValue, monthsActive: row.monthsActive, retention: row.retentionProb },
    },
    actions: [
      retPct < 70
        ? { text: 'Schedule executive-level business review this quarter', emphasis: 'primary' }
        : { text: 'Schedule next quarterly business review', emphasis: 'primary' },
      row.tier === 'platinum' || row.tier === 'gold'
        ? { text: 'Offer multi-year framework agreement to lock retention' }
        : { text: 'Propose basket expansion via cross-sell analysis' },
      { text: `Assign ${row.customer} to named-account track` },
    ],
    related: [],
  };
}

export function buildCrossSellInsight(row, realSkuExists = false) {
  const confPct = Math.round(row.confidence * 100);
  const confidenceBand =
    confPct >= 80 ? 'high' : confPct >= 60 ? 'medium' : 'low';
  const confidenceNarrative = {
    high:   `${confPct}% confidence — strong basket signal. Similar customers who own adjacent SKUs purchase this within 2 quarters.`,
    medium: `${confPct}% confidence — moderate signal. Worth including in next outreach, not worth a dedicated campaign.`,
    low:    `${confPct}% confidence — weak signal. Do not lead with this; use only if the conversation already touches adjacent products.`,
  }[confidenceBand];

  return {
    badge: 'Cross-sell',
    title: `Cross-sell: ${row.sku} → ${row.customer}`,
    subtitle: `${confPct}% affinity`,
    hero: {
      label: 'Recommendation confidence',
      value: `${confPct}%`,
      tone: confPct >= 80 ? 'positive' : confPct >= 60 ? 'neutral' : 'negative',
    },
    stats: [
      { label: 'Target SKU', value: row.sku },
      { label: 'Target customer', value: row.customer },
      { label: 'Confidence', value: `${confPct}%` },
      { label: 'Signal strength', value: confidenceBand.toUpperCase() },
    ],
    why: [
      confidenceNarrative,
      `Signal source: ${row.reason}.`,
      confPct >= 80
        ? 'Fold into the next quote to this customer — minimal pitching required.'
        : confPct >= 60
        ? 'Good candidate for a lightweight intro conversation before formal quote.'
        : 'Revisit after customer completes their next order on adjacent SKUs.',
    ],
    actions: [
      confPct >= 80
        ? { text: 'Add to the next open quote for this customer', emphasis: 'primary' }
        : { text: 'Mention during next account touchpoint', emphasis: 'primary' },
      { text: 'Share reason/rationale with account manager' },
      { text: 'Monitor whether customer buys adjacent SKU first' },
    ],
    related: realSkuExists ? [{ label: row.sku, type: 'sku', id: row.sku }] : [],
  };
}
