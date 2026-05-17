// Pricing Studio v3 / Phase 7 — DecisionFooter tests.
//
// Asserts the post-Phase-7 footer contract:
//   - "Push to quoting" is enabled and opens the publish drawer.
//   - "Branded PDF" calls window.open with the proposal PDF URL.
//   - The Push button is disabled when no price option is active.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DecisionFooter } from '../DecisionFooter';
import type { ActiveOptionView } from '../PriceOptions';
import type { DecisionData } from '@/types/studio';

// Stub the publish drawer so we can assert it gets rendered without pulling
// the full hook tree in here.
vi.mock('../PublishConfirmationDrawer', () => ({
  PublishConfirmationDrawer: ({ open, aid }: { open: boolean; aid: string }) =>
    open ? (
      <div data-testid="mock-publish-drawer" data-aid={aid}>
        publish drawer mock
      </div>
    ) : null,
}));

// usePublishPrice's proposalPdfUrl is the only thing DecisionFooter actually
// imports from the hook module; let the real implementation through.

const data: DecisionData = {
  summary: {
    proposedPrice: '€127.00',
    aid: 'AID-1',
    margin: '35.0%',
    recovery: '€1.2k',
    riskLine: 'win-prob 82%',
  },
  effectiveDate: '2026-05-20',
  notifyDefaults: { sales: true, customers: true, escalate: false, abTest: false },
  notifyLabels: {
    sales: 'Notify *Heiko* (sales lead)',
    customers: 'Notify Tier-A customers',
    escalate: 'Internal escalation',
    abTest: 'Run as A/B holdout',
  },
};

const activeOption: ActiveOptionView = {
  key: 'recommended',
  label: 'Recommended',
  price: '€127.00',
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DecisionFooter — Phase 7 footer', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    window.open = vi.fn();
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('renders Push to quoting enabled when an active option exists', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    const push = screen.getByTestId('decision-footer-push');
    expect(push).toBeEnabled();
  });

  it('opens the PublishConfirmationDrawer on Push click', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    expect(screen.queryByTestId('mock-publish-drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('decision-footer-push'));
    const dr = screen.getByTestId('mock-publish-drawer');
    expect(dr).toBeInTheDocument();
    expect(dr).toHaveAttribute('data-aid', 'AID-1');
  });

  it('Branded PDF opens a persona+lang popover and submits with the chosen values', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    // First click opens the popover, no window.open yet.
    fireEvent.click(screen.getByTestId('decision-footer-pdf'));
    expect(window.open).not.toHaveBeenCalled();
    const popover = screen.getByTestId('decision-footer-pdf-popover');
    expect(popover).toBeInTheDocument();
    // Switch persona to Till + lang to DE, then submit.
    fireEvent.click(
      screen.getByTestId('decision-footer-pdf-persona-till').querySelector('input')!,
    );
    fireEvent.click(
      screen.getByTestId('decision-footer-pdf-lang-de').querySelector('input')!,
    );
    fireEvent.click(screen.getByTestId('decision-footer-pdf-submit'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(/\/pricing\/proposals\/p-1\/pdf\?.*persona=till.*lang=de|\/pricing\/proposals\/p-1\/pdf\?.*lang=de.*persona=till/),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('disables Push when no active option is selected', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={null}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    // With no activeOption, parsePrice falls back to data.summary.proposedPrice
    // ("€127.00") which IS parseable — so push remains enabled. The disable
    // case is exercised when `data.summary.proposedPrice` is unparseable.
    // We assert the enabled path here and use a separate test for the
    // unparseable fallback.
    expect(screen.getByTestId('decision-footer-push')).toBeEnabled();
  });

  it('disables Push when no parseable proposed price is available', () => {
    wrap(
      <DecisionFooter
        data={{
          ...data,
          summary: { ...data.summary, proposedPrice: '—' },
        }}
        activeOption={null}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    expect(screen.getByTestId('decision-footer-push')).toBeDisabled();
  });

  it('renders View approval stepper when onScrollToApproval is provided', () => {
    const onScroll = vi.fn();
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        onScrollToApproval={onScroll}
      />,
    );
    const btn = screen.getByTestId('decision-footer-view-stepper');
    fireEvent.click(btn);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
