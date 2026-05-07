import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LostQuoteDifferential } from '@/features/margin-cockpit/components/LostQuoteDifferential';
import type { LostQuoteDifferentialData } from '@/types';

const data: LostQuoteDifferentialData = {
  title: 'Lost-quote margin differential',
  subtitle: 'Different fix from leakage waterfall',
  significance: 'p = 0.006 · statistically significant',
  tiles: [
    { id: 'won', label: 'Won', value: '70.6%', sub: 'n = 928' },
    { id: 'lost', label: 'Lost', value: '72.4%', sub: 'n = 385' },
    { id: 'diff', label: 'Differential', value: '+1.8pp', sub: 'p = 0.006' },
  ],
  interpretationHtml: '<b>Plain-language:</b> losing on the high-margin end.',
  sourceHtml: 'Source · pricing_analysis.price_sensitivity',
};

describe('LostQuoteDifferential', () => {
  it('renders 3 tiles, the significance chip, and the interpretation', () => {
    render(<LostQuoteDifferential data={data} />);
    expect(screen.getByText('70.6%')).toBeInTheDocument();
    expect(screen.getByText('72.4%')).toBeInTheDocument();
    expect(screen.getByText('+1.8pp')).toBeInTheDocument();
    expect(screen.getByText('p = 0.006 · statistically significant')).toBeInTheDocument();
    expect(screen.getByText(/losing on the high-margin end/)).toBeInTheDocument();
  });
});
