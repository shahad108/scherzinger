import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  TopSKUsForecastTable,
  parseNumeric,
  variancePct,
} from './TopSKUsForecastTable';
import type { SkuRow } from '@/types/forecast';

function row(overrides: Partial<SkuRow>): SkuRow {
  return {
    aid: 'A-001',
    cluster: { label: 'Renewals', conf: 'green' },
    desc: 'Stainless coupler',
    ltmVolume: '1.000',
    forecastVolume: '1.200',
    band: '±5%',
    margin: '32%',
    marginPos: true,
    conf: 'h',
    confLabel: 'High · 94%',
    topCustomer: 'C-100',
    ...overrides,
  };
}

describe('parseNumeric', () => {
  it('parses german thousand separators', () => {
    expect(parseNumeric('1.234.567')).toBe(1234567);
  });

  it('parses english thousand separators with cents', () => {
    expect(parseNumeric('1,234,567.89')).toBeCloseTo(1234567.89);
  });

  it('parses currency-prefixed numbers', () => {
    expect(parseNumeric('€ 12.345,67')).toBeCloseTo(12345.67);
  });

  it('handles k/M suffix', () => {
    expect(parseNumeric('12k')).toBe(12000);
    expect(parseNumeric('1.5M')).toBe(1_500_000);
  });

  it('returns null on garbage', () => {
    expect(parseNumeric('—')).toBeNull();
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric(null)).toBeNull();
  });
});

describe('variancePct', () => {
  it('computes positive variance', () => {
    expect(variancePct('1.000', '1.200')).toBeCloseTo(20);
  });

  it('computes negative variance', () => {
    expect(variancePct('1.000', '800')).toBeCloseTo(-20);
  });

  it('returns null when ltm is zero', () => {
    expect(variancePct('0', '500')).toBeNull();
  });

  it('returns null when unparsable', () => {
    expect(variancePct('—', '500')).toBeNull();
  });
});

describe('TopSKUsForecastTable', () => {
  it('renders rows and ranks by forecast volume', () => {
    const rows = [
      row({ aid: 'A-001', forecastVolume: '500', ltmVolume: '450' }),
      row({ aid: 'A-002', forecastVolume: '5.000', ltmVolume: '4.000' }),
      row({ aid: 'A-003', forecastVolume: '1.500', ltmVolume: '1.200' }),
    ];
    render(<TopSKUsForecastTable rows={rows} limit={10} />);
    const table = screen.getByTestId('top-skus-table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(3);
    // A-002 has the highest forecast → first.
    expect(bodyRows[0].getAttribute('data-testid')).toBe('top-skus-row-A-002');
    expect(bodyRows[1].getAttribute('data-testid')).toBe('top-skus-row-A-003');
    expect(bodyRows[2].getAttribute('data-testid')).toBe('top-skus-row-A-001');
  });

  it('respects the limit', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ aid: `A-${i.toString().padStart(3, '0')}`, forecastVolume: `${1000 - i}` }),
    );
    render(<TopSKUsForecastTable rows={rows} limit={5} />);
    const bodyRows = screen.getByTestId('top-skus-table').querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(5);
  });

  it('renders nothing when no rows', () => {
    const { container } = render(<TopSKUsForecastTable rows={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows variance %', () => {
    const rows = [row({ aid: 'A-001', ltmVolume: '1.000', forecastVolume: '1.200' })];
    render(<TopSKUsForecastTable rows={rows} />);
    expect(screen.getByText('+20.0%')).toBeInTheDocument();
  });

  it('renders em-dash for last override', () => {
    const rows = [row({ aid: 'A-001' })];
    render(<TopSKUsForecastTable rows={rows} />);
    // There can be multiple em-dashes (header period, etc); confirm at least
    // one cell in tbody renders the placeholder.
    const cells = screen.getByTestId('top-skus-table').querySelectorAll('tbody td');
    const overrideCell = Array.from(cells).find((c) => c.textContent === '—');
    expect(overrideCell).toBeDefined();
  });
});
