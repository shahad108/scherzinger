import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiBriefingPage from '@/features/ai-briefing/index';

const useAi = vi.hoisted(() => vi.fn());
vi.mock('@/data/api/useAi', () => ({ useAi }));

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const fixture = {
  header: {
    crumbTrail: ['Cockpit', 'AI Briefing'],
    title: 'Monday Briefing',
    subPills: [],
    subStats: [],
    actions: [],
  },
  memo: {
    title: 'Monday Briefing — Week of Apr 27',
    fromLine: 'From: Pryzm · To: Frank',
    paragraphs: [
      {
        html: 'Margin gap on DB2 deals widened <b>0.4pp</b> in <b>BKAGG</b> last week.',
        citations: [
          { kind: 'cluster', target_id: 'BKAGG', anchor: 'BKAGG', label: 'Cluster BKAGG', jumpTo: '/margin?cluster=BKAGG' },
        ],
      },
      {
        html: 'Article 200832-E sold to Customer 102330 at €6.80 vs Customer 101580 at €4.10.',
        citations: [
          { kind: 'article', target_id: '200832-E', anchor: 'Article 200832-E', label: 'SKU 200832-E', jumpTo: '/pricing?aid=200832-E' },
          { kind: 'customer', target_id: '102330', anchor: 'Customer 102330', label: 'Customer 102330', jumpTo: '/margin?customer_id=102330' },
          { kind: 'customer', target_id: '101580', anchor: 'Customer 101580', label: 'Customer 101580', jumpTo: '/margin?customer_id=101580' },
        ],
      },
    ],
    signature: '— Pryzm',
  },
  sideCards: [
    {
      id: 'changed',
      kind: 'changed',
      title: 'What changed',
      bullets: [
        {
          html: '3 BKAGG deals breached guardrail',
          citations: [
            { kind: 'cluster', target_id: 'BKAGG', anchor: 'BKAGG', label: 'Cluster BKAGG', jumpTo: '/margin?cluster=BKAGG' },
          ],
        },
      ],
    },
    {
      id: 'selfCorrection',
      kind: 'selfCorrection',
      title: 'Self-correction',
      body: 'Recommendation #128 backfired — Customer 101900 reduced order volume.',
      citations: [
        { kind: 'recommendation', target_id: '128', anchor: 'Recommendation #128', label: 'Recommendation #128', jumpTo: '/action-center?focus=rec-128' },
        { kind: 'customer', target_id: '101900', anchor: 'Customer 101900', label: 'Customer 101900', jumpTo: '/margin?customer_id=101900' },
      ],
    },
  ],
  crossLinks: [],
};

describe('AI briefing citations (Phase 10)', () => {
  it('renders clickable Sources chips beneath each memo paragraph', () => {
    useAi.mockReturnValue({ data: fixture, isLoading: false, error: null });
    render(withQc(<AiBriefingPage />));
    // Memo paragraphs get a Sources → row each.
    const sourcesLabels = screen.getAllByText(/Sources →/);
    expect(sourcesLabels.length).toBeGreaterThanOrEqual(2);
    // Chip links resolve to the deep-link jumpTo values.
    const skuLink = screen.getByRole('link', { name: 'SKU 200832-E' });
    expect(skuLink).toHaveAttribute('href', '/pricing?aid=200832-E');
    const custLink = screen.getByRole('link', { name: 'Customer 102330' });
    expect(custLink).toHaveAttribute('href', '/margin?customer_id=102330');
    expect(skuLink).toHaveAttribute('data-citation-kind', 'article');
    expect(custLink).toHaveAttribute('data-citation-kind', 'customer');
  });

  it('renders citations on side-card bullets AND on side-card body prose', () => {
    useAi.mockReturnValue({ data: fixture, isLoading: false, error: null });
    render(withQc(<AiBriefingPage />));
    // Bullet citation: cluster chip beneath the "3 BKAGG deals" bullet.
    expect(screen.getAllByRole('link', { name: /Cluster BKAGG/ }).length).toBeGreaterThan(0);
    // Body citation: recommendation + customer chips beneath the body line.
    const recLink = screen.getByRole('link', { name: /Recommendation #128/ });
    expect(recLink).toHaveAttribute('href', '/action-center?focus=rec-128');
    const cust101900 = screen.getByRole('link', { name: /Customer 101900/ });
    expect(cust101900).toHaveAttribute('href', '/margin?customer_id=101900');
  });
});
