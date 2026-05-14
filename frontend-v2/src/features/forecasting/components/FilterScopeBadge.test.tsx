import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FilterScopeBadge } from './FilterScopeBadge';

describe('FilterScopeBadge', () => {
  it('renders nothing when no scope and not unfiltered', () => {
    const { container } = render(<FilterScopeBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when unfiltered but no active filter (no badge needed)', () => {
    const { container } = render(<FilterScopeBadge unfiltered scope={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders unfiltered badge when filter is active and card cannot honor it', () => {
    render(<FilterScopeBadge unfiltered scope={{ cluster: 'BKAES' }} />);
    const el = screen.getByTestId('filter-scope-badge');
    expect(el).toHaveAttribute('data-variant', 'unfiltered');
    expect(el.textContent).toMatch(/unfiltered/i);
  });

  it('renders scoped badge listing every active filter', () => {
    render(<FilterScopeBadge scope={{ cluster: 'BKAES', tier: 'A', family: 'pumps' }} />);
    const el = screen.getByTestId('filter-scope-badge');
    expect(el).toHaveAttribute('data-variant', 'scoped');
    expect(el.textContent).toMatch(/cluster=BKAES/);
    expect(el.textContent).toMatch(/tier=A/);
    expect(el.textContent).toMatch(/family=pumps/);
  });
});
