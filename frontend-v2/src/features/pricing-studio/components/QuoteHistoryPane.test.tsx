// Pricing Studio v3 / Phase E3 — Quotes evidence pane unit tests.
//
// Covers the acceptance contract for the pane:
//   1. Empty state when status === 'empty'.
//   2. Summary tiles render when status === 'live' with rows.
//   3. Three rows in → three rows out.
//   4. Won rows show actual_db2_margin; lost rows show "—" for actual + gap.
//   5. Negative gap → rose tone; positive gap → emerald tone.
//   6. Degraded status renders the warning banner with the supplied reason.
//   7. Win rate displays as a percentage with 1dp precision.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuoteHistoryPane } from './QuoteHistoryPane';
import type { QuoteHistoryBlock, QuoteHistoryRow } from '@/types/studio';

function makeRow(overrides: Partial<QuoteHistoryRow> = {}): QuoteHistoryRow {
  return {
    quote_id: 'Q-1',
    position: 1,
    date: '2026-03-04',
    customer_id: 'C-100',
    is_won: true,
    status: 'won',
    quantity: 1500,
    revenue: '12300.00',
    quoted_db2_margin: '0.4200',
    actual_db2_margin: '0.3950',
    margin_gap: '-0.0250',
    rejection_code: null,
    currency: 'EUR',
    ...overrides,
  };
}

function makeBlock(
  overrides: Partial<QuoteHistoryBlock> = {},
): QuoteHistoryBlock {
  return {
    status: 'live',
    reason: null,
    rows: [makeRow()],
    summary: {
      n_total: 1,
      n_won: 1,
      n_lost: 0,
      win_rate: '1.0000',
    },
    lineage_ref_id: 'lin-1',
    ...overrides,
  };
}

const EMPTY_BLOCK: QuoteHistoryBlock = {
  status: 'empty',
  reason: 'No quote history for SKU',
  rows: [],
  summary: { n_total: 0, n_won: 0, n_lost: 0, win_rate: null },
  lineage_ref_id: null,
};

describe('QuoteHistoryPane', () => {
  it('renders the empty state when status is empty', () => {
    render(
      <QuoteHistoryPane
        aid="A-1"
        data={EMPTY_BLOCK}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.getByTestId('quote-history-empty')).toBeInTheDocument();
    expect(screen.getByText(/No quote history for SKU/i)).toBeInTheDocument();
    // Summary strip and table should be absent.
    expect(screen.queryByTestId('quote-history-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-history-table')).not.toBeInTheDocument();
  });

  it('renders summary tiles when status is live with rows', () => {
    const block = makeBlock({
      summary: { n_total: 3, n_won: 2, n_lost: 1, win_rate: '0.6700' },
      rows: [
        makeRow({ quote_id: 'Q-1', position: 1 }),
        makeRow({ quote_id: 'Q-2', position: 1, is_won: false }),
        makeRow({ quote_id: 'Q-3', position: 1 }),
      ],
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block} isLoading={false} error={null} />,
    );
    expect(screen.getByTestId('quote-history-summary')).toBeInTheDocument();
    expect(screen.getByTestId('quote-kpi-total')).toHaveTextContent('3');
    expect(screen.getByTestId('quote-kpi-won')).toHaveTextContent('2');
    expect(screen.getByTestId('quote-kpi-lost')).toHaveTextContent('1');
    // Win rate as percentage with 1 decimal.
    expect(screen.getByTestId('quote-kpi-win-rate')).toHaveTextContent('67.0%');
  });

  it('renders one row per quote in the table', () => {
    const block = makeBlock({
      summary: { n_total: 3, n_won: 2, n_lost: 1, win_rate: '0.6700' },
      rows: [
        makeRow({ quote_id: 'Q-A', position: 1 }),
        makeRow({ quote_id: 'Q-B', position: 1, is_won: false }),
        makeRow({ quote_id: 'Q-C', position: 1 }),
      ],
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block} isLoading={false} error={null} />,
    );
    expect(screen.getByTestId('quote-row-Q-A-1')).toBeInTheDocument();
    expect(screen.getByTestId('quote-row-Q-B-1')).toBeInTheDocument();
    expect(screen.getByTestId('quote-row-Q-C-1')).toBeInTheDocument();
    // No extra rows.
    const rows = screen.getAllByTestId(/^quote-row-/);
    expect(rows).toHaveLength(3);
  });

  it('shows actual margin for won rows and em-dash for lost rows', () => {
    const block = makeBlock({
      summary: { n_total: 2, n_won: 1, n_lost: 1, win_rate: '0.5000' },
      rows: [
        makeRow({
          quote_id: 'Q-WON',
          position: 1,
          is_won: true,
          quoted_db2_margin: '0.4000',
          actual_db2_margin: '0.3700',
          margin_gap: '-0.0300',
        }),
        makeRow({
          quote_id: 'Q-LOST',
          position: 1,
          is_won: false,
          status: 'lost',
          quoted_db2_margin: '0.4200',
          actual_db2_margin: null,
          margin_gap: null,
          rejection_code: 'COMPETITOR_PRICE',
        }),
      ],
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block} isLoading={false} error={null} />,
    );
    const wonRow = screen.getByTestId('quote-row-Q-WON-1');
    expect(wonRow).toHaveTextContent('37.0%');
    const lostRow = screen.getByTestId('quote-row-Q-LOST-1');
    // Lost row: actual margin + gap are em-dash.
    const lostGap = screen.getByTestId('quote-gap-Q-LOST-1');
    expect(lostGap).toHaveTextContent('—');
    // The actual-margin cell should show em-dash; the easiest assertion
    // is that the row text contains an em-dash somewhere (next to the
    // gap cell which we already covered, the actual-margin cell also
    // renders one).
    const dashCount = (lostRow.textContent ?? '').match(/—/g)?.length ?? 0;
    expect(dashCount).toBeGreaterThanOrEqual(2);
    // Rejection code present on lost row.
    expect(lostRow).toHaveTextContent('COMPETITOR_PRICE');
  });

  it('tones the gap cell: negative → rose, positive → emerald', () => {
    const block = makeBlock({
      summary: { n_total: 2, n_won: 2, n_lost: 0, win_rate: '1.0000' },
      rows: [
        makeRow({
          quote_id: 'Q-NEG',
          position: 1,
          margin_gap: '-0.0250',
        }),
        makeRow({
          quote_id: 'Q-POS',
          position: 1,
          margin_gap: '0.0150',
        }),
      ],
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block} isLoading={false} error={null} />,
    );
    const neg = screen.getByTestId('quote-gap-Q-NEG-1');
    const pos = screen.getByTestId('quote-gap-Q-POS-1');
    expect(neg.getAttribute('data-tone')).toBe('neg');
    expect(pos.getAttribute('data-tone')).toBe('pos');
    // Signed labels with U+2212 minus on the negative side.
    expect(neg.textContent).toMatch(/^−2\.5 pp$/);
    expect(pos.textContent).toMatch(/^\+1\.5 pp$/);
  });

  it('renders the degraded banner with the supplied reason', () => {
    const block = makeBlock({
      status: 'degraded',
      reason: 'Query error',
      rows: [],
      summary: { n_total: 0, n_won: 0, n_lost: 0, win_rate: null },
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block} isLoading={false} error={null} />,
    );
    // With n_total = 0 we land in the empty branch — exercise the other
    // path: degraded with rows present (the BFF can return degraded with
    // partial data).
    const block2 = makeBlock({
      status: 'degraded',
      reason: 'Partial link join failure',
      summary: { n_total: 1, n_won: 1, n_lost: 0, win_rate: '1.0000' },
      rows: [makeRow()],
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block2} isLoading={false} error={null} />,
    );
    const banner = screen.getByTestId('quote-history-degraded');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('Partial link join failure');
  });

  it('formats win rate as a percentage with 1dp', () => {
    const block = makeBlock({
      summary: { n_total: 100, n_won: 33, n_lost: 67, win_rate: '0.3333' },
      rows: [makeRow()],
    });
    render(
      <QuoteHistoryPane aid="A-1" data={block} isLoading={false} error={null} />,
    );
    expect(screen.getByTestId('quote-kpi-win-rate')).toHaveTextContent(
      '33.3%',
    );
  });
});
