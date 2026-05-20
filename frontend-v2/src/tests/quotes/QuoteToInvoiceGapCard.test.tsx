import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteToInvoiceGapCard } from '@/features/quotes/components/QuoteToInvoiceGapCard';
import type { QuoteToInvoiceGapData } from '@/types/quotes';

const baseData: QuoteToInvoiceGapData = {
  title: 'Quote → invoice margin gap',
  subtitle: 'What we promise vs what we book.',
  overall: { n: 1313, mean_gap_pp: 5.4, median_gap_pp: 1.9, std_gap_pp: 11.2 },
  byYear: [
    { year: 2023, n: 412, mean_gap_pp: 6.1, median_gap_pp: 2.3 },
    { year: 2024, n: 478, mean_gap_pp: 5.2, median_gap_pp: 1.8 },
    { year: 2025, n: 423, mean_gap_pp: 4.8, median_gap_pp: 1.6 },
  ],
  tone: 'warning',
  headline: { median: '1.9pp', mean: '5.4pp', n: '1,313' },
  coverage: { linked: 1313, pct: 28.5, label: '29% of quote lines linked to a booked invoice', tone: 'positive' },
  interpretation: 'Median customer pays 1.9pp less margin than the quote promised.',
  source: { table: 'quote_invoice_links', joinOn: 'quote_id + quote_position', buildScript: 'scripts/link_quotes_invoices.py' },
  heuristic: { label: 'Real signal', rule: 'median / mean computed from quote_invoice_links.margin_gap', qualifier: 'Same source feeds Lost-Quote.' },
};

describe('QuoteToInvoiceGapCard', () => {
  it('renders the headline numbers + byYear rows + source', () => {
    render(<QuoteToInvoiceGapCard data={baseData} />);
    expect(screen.getByText('1.9pp')).toBeInTheDocument();
    expect(screen.getByText('5.4pp')).toBeInTheDocument();
    expect(screen.getByText('1,313')).toBeInTheDocument();
    expect(screen.getByText('29% of quote lines linked to a booked invoice')).toBeInTheDocument();
    expect(screen.getByText('quote_invoice_links')).toBeInTheDocument();
    // 2025 should be flagged "latest".
    expect(screen.getByText('latest')).toBeInTheDocument();
  });

  it('expands the heuristic line on click', () => {
    render(<QuoteToInvoiceGapCard data={baseData} />);
    expect(screen.queryByText(/Same source feeds Lost-Quote\./)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Real signal/ }));
    expect(screen.getByText(/Same source feeds Lost-Quote\./)).toBeInTheDocument();
  });

  it('shows a graceful empty state when linkage data is missing', () => {
    const empty = { ...baseData, overall: null, byYear: [], headline: { median: '—', mean: '—', n: '—' } };
    render(<QuoteToInvoiceGapCard data={empty} />);
    expect(screen.getByText(/No linkage data:/)).toBeInTheDocument();
  });
});
