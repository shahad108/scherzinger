// Pricing Studio v3 / Phase 10 — FreshnessChip tone matrix tests.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FreshnessChip, freshnessTone } from '../FreshnessChip';

describe('FreshnessChip', () => {
  const NOW = new Date('2026-05-17T12:00:00Z').getTime();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders green/fresh when dataThrough is within 24h', () => {
    vi.setSystemTime(NOW);
    // 1h ago.
    const iso = new Date(NOW - 1 * 3600 * 1000).toISOString();
    render(<FreshnessChip dataThrough={iso} />);
    const chip = screen.getByTestId('freshness-chip');
    expect(chip).toHaveAttribute('data-freshness', 'fresh');
    expect(chip).toHaveTextContent(/Data through/i);
  });

  it('renders amber/aging between 24h and 72h', () => {
    vi.setSystemTime(NOW);
    // 36h ago.
    const iso = new Date(NOW - 36 * 3600 * 1000).toISOString();
    render(<FreshnessChip dataThrough={iso} />);
    const chip = screen.getByTestId('freshness-chip');
    expect(chip).toHaveAttribute('data-freshness', 'aging');
  });

  it('renders rose/stale at ≥72h', () => {
    vi.setSystemTime(NOW);
    // 96h ago.
    const iso = new Date(NOW - 96 * 3600 * 1000).toISOString();
    render(<FreshnessChip dataThrough={iso} />);
    const chip = screen.getByTestId('freshness-chip');
    expect(chip).toHaveAttribute('data-freshness', 'stale');
  });

  it('renders unknown state when timestamp is missing or invalid', () => {
    render(<FreshnessChip dataThrough={null} />);
    expect(screen.getByTestId('freshness-chip')).toHaveAttribute(
      'data-freshness',
      'unknown',
    );
  });

  it('exposes a tone helper directly callable in components', () => {
    const t = freshnessTone(new Date(NOW - 2 * 3600 * 1000).toISOString(), new Date(NOW));
    expect(t.level).toBe('fresh');
  });

  it('renders a tooltip explaining the threshold', () => {
    vi.setSystemTime(NOW);
    const iso = new Date(NOW - 1 * 3600 * 1000).toISOString();
    render(<FreshnessChip dataThrough={iso} />);
    const chip = screen.getByTestId('freshness-chip');
    expect(chip).toHaveAttribute('title');
    expect(chip.getAttribute('title')).toMatch(/Fresh/i);
  });
});
