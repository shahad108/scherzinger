import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

  it('Send to Till is disabled until a report has been generated', () => {
    const onAction = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ReportCard onAction={onAction} />
      </QueryClientProvider>,
    );

    const sendBtn = screen.getByRole('button', { name: /Send to Till/i });
    expect(sendBtn).toBeDisabled();
    expect(sendBtn).toHaveAttribute('title', expect.stringMatching(/Generate the report first/i));

    // Generate button is enabled and labelled "Generate report" before any
    // job exists.
    expect(screen.getByRole('button', { name: /Generate report/i })).not.toBeDisabled();
  });

  // Task 2 cleanup (plan §4 / §2.1 F2) — Workspace-scope and Export
  // drawer items come from ``header.workspaceScope`` / ``header.exportContext``.
  // The backend ships empty arrays today; the dispatcher renders an
  // ``emptyLabel`` panel so the user understands the Phase 2 unlock
  // gating. We no longer fabricate items from breadcrumbLabel.
  it('PageHead workspace scope consumes header.workspaceScope (empty-state today)', () => {
    const onAction = vi.fn();
    const header = {
      greeting: 'Good morning, Frank.',
      week: 'Week 18',
      dateRange: '—',
      stats: [],
      workspaceScope: [],
      exportContext: [],
    };
    render(
      <PageHead
        header={header}
        breadcrumbLabel="Pricing Analyst · Frank"
        greeting="Good morning, Frank."
        hideLocked={false}
        onToggleHideLocked={() => {}}
        showAll={false}
        onToggleShowAll={() => {}}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Workspace scope/i }));
    const intent = onAction.mock.calls[0][0];
    expect(intent.drawer?.title).toMatch(/workspace scope/i);
    expect(intent.drawer?.items).toEqual([]);
    expect(intent.drawer?.emptyLabel).toMatch(/Phase 2/i);

    onAction.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Export/i }));
    const exportIntent = onAction.mock.calls[0][0];
    expect(exportIntent.disabledReason).toBeTruthy();
  });

  it('PageHead export drawer is empty pre-Phase-2 even when report is ready', () => {
    const onAction = vi.fn();
    const header = {
      greeting: 'Good morning, Frank.',
      week: 'Week 18',
      dateRange: '—',
      stats: [],
      workspaceScope: [],
      exportContext: [],
    };
    render(
      <PageHead
        header={header}
        breadcrumbLabel="Pricing Analyst · Frank"
        greeting="Good morning, Frank."
        hideLocked={false}
        onToggleHideLocked={() => {}}
        showAll={false}
        onToggleShowAll={() => {}}
        onAction={onAction}
        reportReady
        traceId="ac-abc123"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Export/i }));
    const intent = onAction.mock.calls[0][0];
    expect(intent.drawer?.title).toMatch(/report export/i);
    expect(intent.drawer?.items).toEqual([]);
    expect(intent.drawer?.emptyLabel).toMatch(/Phase 2/i);
  });
});
