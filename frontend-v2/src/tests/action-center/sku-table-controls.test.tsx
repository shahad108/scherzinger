/**
 * Task 5 — SkuTable sortable headers + bulk select + stale chip + article drawer.
 *
 * Verifies plan §2.9 F17/F18/F19:
 *   - Default sort is revenueAtRisk desc.
 *   - Clicking a sortable header re-orders rows and toggles direction.
 *   - The sort state is persisted to localStorage.
 *   - Selecting checkboxes shows a sticky bulk toolbar with the count.
 *   - The bulk action emits an ActionIntent that routes to /pricing
 *     with ``query.aids`` as the CSV of selected article ids.
 *   - Rows with ``lastMoveDays >= 365`` render a Stale chip.
 *   - Clicking the article cell dispatches a sku_summary drawer intent.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkuTable } from '@/features/action-center/components/SkuTable';
import type { SkuRow } from '@/types';

function makeRow(overrides: Partial<SkuRow> = {}): SkuRow {
  return {
    article: 'A1',
    description: 'desc',
    commodity: 'steel',
    clusterConf: 70,
    clusterTone: 'mid',
    marginDelta: '20.0% → 18.0%',
    marginTone: 'neutral',
    status: 'movable',
    statusLabel: 'Movable',
    actionLabel: 'Open in Studio',
    action: { route: '/pricing', query: { aid: overrides.article ?? 'A1' } },
    revenueAtRisk: 1000,
    lastMoveDays: 30,
    ...overrides,
  };
}

const STORAGE_KEY = 'pryzm.v2.actionCenter.skuSort';

describe('SkuTable controls (Task 5)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('defaults to revenueAtRisk desc and orders rows accordingly', () => {
    const rows: SkuRow[] = [
      makeRow({ article: 'LOW', revenueAtRisk: 100 }),
      makeRow({ article: 'HIGH', revenueAtRisk: 5000 }),
      makeRow({ article: 'MID', revenueAtRisk: 1000 }),
    ];
    render(<SkuTable rows={rows} />);
    const articleButtons = screen.getAllByRole('button', { name: /^(LOW|MID|HIGH)$/ });
    expect(articleButtons.map((b) => b.textContent)).toEqual(['HIGH', 'MID', 'LOW']);
  });

  it('clicking the margin Δ header sorts desc, then asc on second click; persists to localStorage', () => {
    const rows: SkuRow[] = [
      makeRow({ article: 'KEEP', marginDelta: '20.0% → 19.5%', revenueAtRisk: 1 }), // -0.5 pp
      makeRow({ article: 'DROP', marginDelta: '30.0% → 5.0%', revenueAtRisk: 2 }),  // -25 pp
      makeRow({ article: 'GAIN', marginDelta: '10.0% → 18.0%', revenueAtRisk: 3 }), // +8 pp
    ];
    render(<SkuTable rows={rows} />);
    const header = screen.getByRole('button', { name: /Margin Δ/i });

    fireEvent.click(header);
    let articleButtons = screen.getAllByRole('button', { name: /^(KEEP|DROP|GAIN)$/ });
    // desc: largest signed delta first → GAIN, KEEP, DROP.
    expect(articleButtons.map((b) => b.textContent)).toEqual(['GAIN', 'KEEP', 'DROP']);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      column: 'marginDelta',
      direction: 'desc',
    });

    fireEvent.click(header);
    articleButtons = screen.getAllByRole('button', { name: /^(KEEP|DROP|GAIN)$/ });
    // asc: smallest signed delta first → DROP, KEEP, GAIN.
    expect(articleButtons.map((b) => b.textContent)).toEqual(['DROP', 'KEEP', 'GAIN']);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      column: 'marginDelta',
      direction: 'asc',
    });
  });

  it('selecting two rows shows the bulk toolbar with "(2)" and emits a /pricing intent on click', () => {
    const rows: SkuRow[] = [
      makeRow({ article: 'A' }),
      makeRow({ article: 'B' }),
      makeRow({ article: 'C' }),
    ];
    const onBulk = vi.fn();
    render(<SkuTable rows={rows} onBulk={onBulk} />);

    // Toolbar hidden by default.
    expect(screen.queryByTestId('sku-bulk-toolbar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select B' }));

    const toolbar = screen.getByTestId('sku-bulk-toolbar');
    expect(toolbar).toBeInTheDocument();
    const bulkBtn = within(toolbar).getByRole('button', {
      name: /Open all in Pricing Studio \(2\)/i,
    });
    fireEvent.click(bulkBtn);

    expect(onBulk).toHaveBeenCalledTimes(1);
    const intent = onBulk.mock.calls[0][0];
    expect(intent.route).toBe('/pricing');
    expect(intent.query.aids).toBe('A,B');
    expect(intent.query.source).toBe('action-center');
  });

  it('renders a Stale chip when lastMoveDays >= 365', () => {
    const rows: SkuRow[] = [
      makeRow({ article: 'OLD', lastMoveDays: 380 }),
      makeRow({ article: 'NEW', lastMoveDays: 10 }),
    ];
    render(<SkuTable rows={rows} />);
    const oldRow = screen.getByRole('button', { name: 'OLD' }).closest('tr')!;
    const newRow = screen.getByRole('button', { name: 'NEW' }).closest('tr')!;
    expect(within(oldRow).getByText('Stale')).toBeInTheDocument();
    expect(within(newRow).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('clicking the article cell fires the sku_summary drawer intent', () => {
    const rows: SkuRow[] = [makeRow({ article: 'X42' })];
    const onBulk = vi.fn();
    render(<SkuTable rows={rows} onBulk={onBulk} />);

    fireEvent.click(screen.getByRole('button', { name: 'X42' }));

    expect(onBulk).toHaveBeenCalledTimes(1);
    const intent = onBulk.mock.calls[0][0];
    expect(intent.drawer.formKind).toBe('sku_summary');
    expect(intent.drawer.context.articleId).toBe('X42');
  });

  it('clears selection when the queue filter changes', () => {
    const rows: SkuRow[] = [makeRow({ article: 'A' }), makeRow({ article: 'B' })];
    const { rerender } = render(<SkuTable rows={rows} queueFilter="all" />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select A' }));
    expect(screen.getByTestId('sku-bulk-toolbar')).toBeInTheDocument();

    rerender(<SkuTable rows={rows} queueFilter="churn" />);

    expect(screen.queryByTestId('sku-bulk-toolbar')).not.toBeInTheDocument();
  });
});
