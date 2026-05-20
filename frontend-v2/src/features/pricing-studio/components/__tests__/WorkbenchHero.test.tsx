// Pricing Studio v3 / Phase 4 — WorkbenchHero tests (History button).

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkbenchHero, type HeroView } from '../WorkbenchHero';

const hero: HeroView = {
  eyebrow: 'PRICING WORKBENCH',
  title: 'Article 200832-E',
  sub: 'Subhead',
  chips: [{ label: 'Cluster: BKAGG' }],
  meta: 'Meta line',
  currentPrice: '€118.00',
  currentMargin: '15%',
  currentMarginTone: 'good',
  targetText: 'Target €121',
};

describe('WorkbenchHero', () => {
  it('does not render the History button when onOpenAudit is undefined', () => {
    render(<WorkbenchHero hero={hero} />);
    expect(screen.queryByTestId('workbench-hero-history-button')).not.toBeInTheDocument();
  });

  it('renders the History button when onOpenAudit is provided', () => {
    render(<WorkbenchHero hero={hero} onOpenAudit={() => {}} />);
    expect(screen.getByTestId('workbench-hero-history-button')).toBeInTheDocument();
  });

  it('calls onOpenAudit when the History button is clicked', () => {
    const onOpenAudit = vi.fn();
    render(<WorkbenchHero hero={hero} onOpenAudit={onOpenAudit} />);
    fireEvent.click(screen.getByTestId('workbench-hero-history-button'));
    expect(onOpenAudit).toHaveBeenCalledTimes(1);
  });

  it('renders the badge when auditBadge > 0', () => {
    render(<WorkbenchHero hero={hero} onOpenAudit={() => {}} auditBadge={3} />);
    const badge = screen.getByTestId('workbench-hero-history-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('3');
  });

  it('hides the badge when auditBadge is 0', () => {
    render(<WorkbenchHero hero={hero} onOpenAudit={() => {}} auditBadge={0} />);
    expect(screen.queryByTestId('workbench-hero-history-badge')).not.toBeInTheDocument();
  });
});
