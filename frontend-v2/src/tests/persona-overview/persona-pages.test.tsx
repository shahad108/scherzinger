import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MdOverviewPage from '@/features/persona-overview/MdOverviewPage';
import DealInboxPage from '@/features/persona-overview/DealInboxPage';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch }));

beforeEach(() => apiFetch.mockReset());

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const mdFixture = {
  header: { title: 'Managing Director — Overview', sub: 'read-only', for_user: 'Till' },
  kpis: [
    { key: 'pending_approval', label: 'Pending approval', value: 2, sub: '2 awaiting', tone: 'warning' },
    { key: 'drafts', label: 'Draft proposals', value: 5, sub: 'Frank cycle', tone: 'info' },
    { key: 'ab_running', label: 'A/B tests live', value: 1, sub: 'with audit', tone: 'info' },
    { key: 'shares', label: 'Shared with me', value: 3, sub: '1 unread', tone: 'warning' },
  ],
  approvalQueue: {
    title: 'Approval queue',
    subtitle: 'Pending MD sign-off',
    rows: [
      { id: 'p-1', article_id: '200832-E', current_price: 4.1, proposed_price: 4.38, delta_pp: 6.83, status: 'pending_approval', approval_required: true, created_at: '2026-05-12T08:00:00Z' },
    ],
  },
  shares: {
    title: 'Shared with me',
    subtitle: 'From Frank',
    rows: [
      { id: 's-1', external_id: 'share:abc', title: 'Frank shared: 200832-E peer spread', sub: 'Need MD sign-off', link: '/action-center?focus=rec-1', unread: true, created_at: '2026-05-12T09:00:00Z' },
    ],
  },
  recentAudit: [
    { kind: 'share_decision', target_id: 'rec-1', audit_hash: 'deadbeef0102', actor_persona: 'frank', created_at: '2026-05-12T09:00:00Z' },
  ],
  crossLinks: [{ label: 'Action Center', jumpTo: '/action-center?persona=till' }],
  heuristic: { label: 'Read-only', rule: 'Counts read live.' },
};

describe('MdOverviewPage (Phase 12)', () => {
  it('renders KPI tiles, approval queue, shares list, and recent audit', async () => {
    apiFetch.mockResolvedValueOnce(mdFixture);
    render(withQc(<MdOverviewPage />));
    await waitFor(() => expect(screen.getByText('Managing Director — Overview')).toBeInTheDocument());
    // KPI tiles ("Shared with me" appears twice — as a KPI label and a section title).
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getAllByText('Shared with me').length).toBeGreaterThanOrEqual(1);
    // Approval queue row
    expect(screen.getByText('200832-E')).toBeInTheDocument();
    expect(screen.getByText('€4.10')).toBeInTheDocument();
    expect(screen.getByText('€4.38')).toBeInTheDocument();
    expect(screen.getByText('+6.83pp')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('requires MD')).toBeInTheDocument();
    // Share row links to the audit trail.
    expect(screen.getByRole('link', { name: /Open audit trail/ })).toHaveAttribute('href', '/action-center?focus=rec-1');
    // Audit hash visible.
    expect(screen.getByText('deadbeef0102')).toBeInTheDocument();
  });
});

const dealFixture = {
  header: { title: 'Sales — Deal Inbox', sub: 'read-only', for_user: 'Heiko' },
  kpis: [
    { key: 'shares', label: 'Shared with me', value: 2, sub: '1 unread', tone: 'warning' },
    { key: 'quote_invoice_gap', label: 'Quote→invoice median gap', value: '1.9pp', sub: '5.4pp mean · n=1,949', tone: 'warning' },
    { key: 'ab_running', label: 'Live A/B tests', value: 1, sub: 'Frank price experiments', tone: 'info' },
  ],
  shares: {
    title: 'Shared with me',
    subtitle: 'Negotiation prep',
    rows: [
      { id: 's-2', external_id: 'share:def', title: 'Frank shared: customer 101580', sub: 'Negotiation note', link: '/action-center?focus=rec-2', unread: true, created_at: '2026-05-12T09:30:00Z' },
    ],
  },
  lostQuote: {
    title: 'Quote → invoice gap',
    subtitle: 'Negotiation anchor',
    overall: { n: 1949, mean_gap_pp: 5.4, median_gap_pp: 1.9, std_gap_pp: 11.2 },
    byYear: [
      { year: 2024, n: 511, median_gap_pp: 1.58, mean_gap_pp: 6.37 },
      { year: 2025, n: 485, median_gap_pp: 0.97, mean_gap_pp: 5.34 },
    ],
  },
  recentRecs: [
    { id: 'rec-1234567890', title: 'Margin erosion 200832-E', article_id: '200832-E', cluster: 'BKAES', status: 'pending', source_kind: 'margin_erosion' },
  ],
  crossLinks: [{ label: 'Quotes', jumpTo: '/quotes?persona=heiko' }],
  heuristic: { label: 'Read-only', rule: 'Lost-quote gap pulled live.' },
};

describe('DealInboxPage (Phase 12)', () => {
  it('renders KPIs, shares, lost-quote gap headline + by-year, and recent recs', async () => {
    apiFetch.mockResolvedValueOnce(dealFixture);
    render(withQc(<DealInboxPage />));
    await waitFor(() => expect(screen.getByText('Sales — Deal Inbox')).toBeInTheDocument());
    // 1.9pp appears in both the KPI tile and the lost-quote median card.
    expect(screen.getAllByText('1.9pp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5.4pp')).toBeInTheDocument();
    expect(screen.getByText('1,949')).toBeInTheDocument();
    // By-year tiles
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('0.97pp')).toBeInTheDocument();
    // Shares row
    expect(screen.getByText('Frank shared: customer 101580')).toBeInTheDocument();
    // Recent recommendation
    expect(screen.getByText('Margin erosion 200832-E')).toBeInTheDocument();
    expect(screen.getByText('BKAES')).toBeInTheDocument();
  });
});
