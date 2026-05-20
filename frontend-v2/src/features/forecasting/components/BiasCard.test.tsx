import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BiasCard } from './BiasCard';
import type { BiasPanel } from '@/types/forecast';

describe('BiasCard', () => {
  it('renders null when data is undefined', () => {
    const { container } = render(<BiasCard data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when rows are empty', () => {
    const { container } = render(<BiasCard data={{ rows: [], windowMonths: 6 }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one row per cluster', () => {
    const data: BiasPanel = {
      rows: [
        { cluster: 'BKAES', cmeOverMad: 1.2, hitRatePct: 78, trailing6moDirection: 'flat' },
        { cluster: 'BKAGG', cmeOverMad: 3.5, hitRatePct: 65, trailing6moDirection: 'over' },
        { cluster: 'MBDIV', cmeOverMad: -4.5, hitRatePct: 50, trailing6moDirection: 'under' },
      ],
      windowMonths: 6,
    };
    render(<BiasCard data={data} />);
    expect(screen.getByText('BKAES')).toBeInTheDocument();
    expect(screen.getByText('BKAGG')).toBeInTheDocument();
    expect(screen.getByText('MBDIV')).toBeInTheDocument();
  });

  it('applies red tone for |tracking signal| > 4', () => {
    const data: BiasPanel = {
      rows: [{ cluster: 'X', cmeOverMad: -5.2, hitRatePct: 40, trailing6moDirection: 'under' }],
      windowMonths: 6,
    };
    render(<BiasCard data={data} />);
    const chip = screen.getByTestId('bias-ts');
    expect(chip.className).toContain('rose');
  });

  it('renders the right direction chip per row', () => {
    const data: BiasPanel = {
      rows: [
        { cluster: 'A', cmeOverMad: 1.0, hitRatePct: 70, trailing6moDirection: 'over' },
        { cluster: 'B', cmeOverMad: -1.0, hitRatePct: 60, trailing6moDirection: 'under' },
        { cluster: 'C', cmeOverMad: 0.0, hitRatePct: 90, trailing6moDirection: 'flat' },
      ],
      windowMonths: 6,
    };
    render(<BiasCard data={data} />);
    const chips = screen.getAllByTestId('bias-direction');
    const directions = chips.map((el) => el.getAttribute('data-direction'));
    expect(directions).toEqual(['over', 'under', 'flat']);
  });
});
