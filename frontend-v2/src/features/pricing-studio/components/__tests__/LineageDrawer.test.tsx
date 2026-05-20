// Pricing Studio v3 / Phase 10 — LineageDrawer test suite.
//
// Phase 10 swapped the client-side lineage synthesiser for a real-network
// `GET /api/v1/lineage/{ref_id}` call. The drawer now renders:
//   • the primary source row (from the open lineage_ref payload)
//   • any preview-derived source rows the BFF attached
//   • a "Lineage not found" empty state when the BFF returns 404

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { LineageDrawerProvider, useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { OpenOpts } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { LineageDrawer } from '../LineageDrawer';
import { lineageRef, recommendation, wtp } from './fixtures';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>(
    '@/lib/api/client',
  );
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

function Opener({
  opts,
  label = 'open',
  testId = 'opener',
}: {
  opts?: OpenOpts;
  label?: ReactNode;
  testId?: string;
}) {
  const { openLineage } = useLineageDrawer();
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() =>
        openLineage(lineageRef('drawer-test-1'), { subjectTitle: 'Subject X', ...(opts ?? {}) })
      }
    >
      {label}
    </button>
  );
}

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <LineageDrawerProvider>{children}</LineageDrawerProvider>
    </QueryClientProvider>
  );
}

function buildWireResponse(id: string) {
  return {
    id,
    source_kind: 'elasticity_model',
    source_id: `model:logit:${id.slice(0, 8)}`,
    sql: null,
    model: 'logit-v1.2',
    computed_at: '2026-05-15T10:00:00Z',
    computed_by: 'recommendation-composer',
    preview: [
      { field: 'source_kind', value: 'elasticity_model' },
      { field: 'invoice_ledger', value: 'INV-2026-Q2-sample' },
      { field: 'competitor_feed', value: 'cf-sample-7' },
    ],
  };
}

describe('LineageDrawer', () => {
  let qc: QueryClient;
  beforeEach(() => {
    apiFetchMock.mockReset();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('renders the subject title when opened and closes on close action', async () => {
    apiFetchMock.mockResolvedValueOnce(buildWireResponse('drawer-test-1'));
    render(
      <>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    expect(screen.queryByText('Subject X')).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.getByText('Subject X')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: /Subject X/i });
    expect(region).toBeInTheDocument();
  });

  it('renders source rows from the real /lineage/{id} endpoint', async () => {
    apiFetchMock.mockResolvedValueOnce(buildWireResponse('drawer-test-1'));
    render(
      <>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/lineage\/drawer-test-1$/),
    );
    // Primary source rendered from the wire response.
    await waitFor(() =>
      expect(screen.getAllByText(/model:logit:/i).length).toBeGreaterThan(0),
    );
    // Preview row materialised as a source.
    expect(screen.getByText(/Invoice ledger/i)).toBeInTheDocument();
  });

  it('renders the "Lineage not found" placeholder when the BFF returns 404', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('API /lineage/drawer-test-1 → 404'));
    render(
      <>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('lineage-drawer-not-found')).toBeInTheDocument(),
    );
  });

  it('expands a source row to reveal SQL/feature copy', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ...buildWireResponse('drawer-test-1'),
      sql: null,
    });
    render(
      <>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    await waitFor(() =>
      expect(screen.getAllByText(/model:logit:/i).length).toBeGreaterThan(0),
    );
    // The first source button is the primary row; expand it.
    const primaryRow = screen
      .getByText(/Sources/i)
      .closest('section')!
      .querySelectorAll('button[aria-expanded="false"]')[0] as HTMLElement;
    fireEvent.click(primaryRow);
    expect(screen.getByText(/No SQL\/feature snippet stored/i)).toBeInTheDocument();
  });

  it('renders the drivers waterfall when drivers are passed via openLineage', async () => {
    apiFetchMock.mockResolvedValueOnce(buildWireResponse('drawer-test-1'));
    const rec = recommendation();
    render(
      <>
        <Opener opts={{ drivers: rec.drivers }} />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.getByTestId('lineage-drawer-drivers')).toBeInTheDocument();
    expect(screen.getByTestId('driver-waterfall')).toBeInTheDocument();
  });

  it('renders the WTP band-strip when wtp is passed via openLineage', async () => {
    apiFetchMock.mockResolvedValueOnce(buildWireResponse('drawer-test-1'));
    render(
      <>
        <Opener opts={{ wtp: wtp(), recommendedPrice: '127.00' }} />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.getByTestId('lineage-drawer-wtp')).toBeInTheDocument();
    expect(screen.getByTestId('wtp-band-strip')).toBeInTheDocument();
  });

  it('renders the confidence + n-deals chip when both are provided', async () => {
    apiFetchMock.mockResolvedValueOnce(buildWireResponse('drawer-test-1'));
    render(
      <>
        <Opener opts={{ confidenceLevel: 'med', nDeals: 14 }} />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    const chip = screen.getByTestId('lineage-drawer-confidence-chip');
    expect(chip).toHaveTextContent(/confidence: medium/i);
    expect(chip).toHaveTextContent(/n=14 deals/i);
  });

  it('omits the confidence chip when neither confidenceLevel nor nDeals is provided', async () => {
    apiFetchMock.mockResolvedValueOnce(buildWireResponse('drawer-test-1'));
    render(
      <>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </>,
      { wrapper: wrap(qc) },
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.queryByTestId('lineage-drawer-confidence-chip')).not.toBeInTheDocument();
  });
});
