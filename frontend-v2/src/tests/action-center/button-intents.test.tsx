import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrustStrip } from '@/features/action-center/components/TrustStrip';
import { SkuTable } from '@/features/action-center/components/SkuTable';
import { ReportCard } from '@/features/action-center/components/ReportCard';
import { PageHead } from '@/features/action-center/components/PageHead';
import type { SkuRow, TrustTile } from '@/types';

describe('Action Center button wiring', () => {
  it('emits the clicked trust tile for drawer handling', () => {
    const onTile = vi.fn();
    const tiles: TrustTile[] = [{ label: 'Data coverage', value: '94%', caption: 'Linked records' }];

    render(<TrustStrip tiles={tiles} onTile={onTile} />);
    fireEvent.click(screen.getByRole('button', { name: /Data coverage/i }));

    expect(onTile).toHaveBeenCalledWith(tiles[0]);
  });

  it('emits SKU rows for route or queue handling', () => {
    const onAction = vi.fn();
    const rows: SkuRow[] = [
      {
        article: '200832-E',
        description: 'Precision shaft',
        commodity: 'steel',
        clusterConf: 82,
        clusterTone: 'high',
        marginDelta: '+2pp',
        marginTone: 'positive',
        status: 'movable',
        statusLabel: 'Movable',
        actionLabel: 'Open in Studio',
      },
    ];

    render(<SkuTable rows={rows} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Open in Studio/i }));

    expect(onAction).toHaveBeenCalledWith(rows[0]);
  });

  it('keeps report actions backend-required', () => {
    const onAction = vi.fn();
    render(<ReportCard onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate PDF/i }));

    expect(onAction).toHaveBeenCalledWith({
      disabledReason: 'Backend endpoint required before branded reports can be generated or sent.',
    });
  });

  // Phase 4 — `All Departments` is preview until saved-views ships in
  // Phase 7; `Export` stays disabled until reports MVP (Phase 6). Both
  // must emit explicit production wording rather than a generic toast.
  it('PageHead "All Departments" opens the preview drawer', () => {
    const onAction = vi.fn();
    const header = { greeting: 'Good morning, Frank.', week: 'Week 18', dateRange: '—', stats: [] };
    render(
      <PageHead
        header={header}
        hideLocked={false}
        onToggleHideLocked={() => {}}
        showAll={false}
        onToggleShowAll={() => {}}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /All Departments/i }));
    const intent = onAction.mock.calls[0][0];
    expect(intent.drawer?.title).toMatch(/preview/i);
    expect(intent.drawer?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: expect.stringMatching(/preview/i) })]),
    );

    onAction.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Export/i }));
    const exportIntent = onAction.mock.calls[0][0];
    expect(exportIntent.disabledReason).toBeTruthy();
  });
});
