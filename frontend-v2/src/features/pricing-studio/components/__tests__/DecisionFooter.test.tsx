// Pricing Studio v3 / Phase F — DecisionFooter tests.
//
// Asserts:
//   - Phase 7: Push-to-quoting opens the publish drawer; disabled w/o option.
//   - Phase 10: Branded PDF popover persists persona+lang into proposalPdfUrl.
//   - Phase F (F2): Accept fires useAcceptDecision.
//   - Phase F (F3): Reject + Snooze flip the lifecycle chip but DO NOT hide
//                   the decision row.
//   - Phase F (F4): Share opens the ShareDecisionDrawer.
//   - Phase F (F6): A/B Slice opens the inline ABTestCard wrapped in a drawer.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DecisionFooter } from '../DecisionFooter';
import type { ActiveOptionView } from '../PriceOptions';
import type { DecisionData } from '@/types/studio';

// Capture mutation calls so we can assert per-button wiring.
const acceptMutate = vi.fn();
const declineMutate = vi.fn();
const snoozeMutate = vi.fn();

vi.mock('@/data/api/useActions', async (orig) => {
  const real = await orig<typeof import('@/data/api/useActions')>();
  return {
    ...real,
    useAcceptDecision: () => ({
      mutate: acceptMutate,
      mutateAsync: acceptMutate,
      isPending: false,
    }),
    useDeclineDecision: () => ({
      mutate: declineMutate,
      mutateAsync: declineMutate,
      isPending: false,
    }),
    useSnoozeDecision: () => ({
      mutate: snoozeMutate,
      mutateAsync: snoozeMutate,
      isPending: false,
    }),
    useShareDecision: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    }),
  };
});

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

// Stub ShareDecisionDrawer so we just need to assert it opens.
vi.mock('../ShareDecisionDrawer', () => ({
  ShareDecisionDrawer: ({
    open,
    articleId,
  }: {
    open: boolean;
    articleId: string;
  }) =>
    open ? (
      <div data-testid="mock-share-drawer" data-aid={articleId}>
        share drawer mock
      </div>
    ) : null,
}));

// Stub ABTestCard so the AB drawer can be asserted without pulling in
// useCreateAbTest et al.
vi.mock('../ABTestCard', () => ({
  ABTestCard: (props: {
    aid: string;
    defaultControlPrice: string;
    defaultVariantPrice: string;
  }) => (
    <div
      data-testid="mock-abtestcard"
      data-aid={props.aid}
      data-control={props.defaultControlPrice}
      data-variant={props.defaultVariantPrice}
    >
      ab card mock
    </div>
  ),
}));

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
  id: 'market',
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

describe('DecisionFooter — Phase 7 + Phase F', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    acceptMutate.mockReset();
    declineMutate.mockReset();
    snoozeMutate.mockReset();
    window.open = vi.fn();
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('renders all 7 primary footer buttons', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
        onScrollToApproval={() => {}}
      />,
    );
    expect(screen.getByTestId('decision-footer-accept')).toBeInTheDocument();
    expect(screen.getByTestId('decision-footer-reject')).toBeInTheDocument();
    expect(screen.getByTestId('decision-footer-snooze')).toBeInTheDocument();
    expect(screen.getByTestId('decision-footer-share')).toBeInTheDocument();
    expect(screen.getByTestId('decision-footer-ab-slice')).toBeInTheDocument();
    expect(screen.getByTestId('decision-footer-push')).toBeInTheDocument();
    expect(screen.getByTestId('decision-footer-pdf')).toBeInTheDocument();
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
    expect(screen.getByTestId('decision-footer-push')).toBeEnabled();
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

  it('Accept fires useAcceptDecision and shows the Accepted chip', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    fireEvent.click(screen.getByTestId('decision-footer-accept'));
    expect(acceptMutate).toHaveBeenCalledTimes(1);
    const body = acceptMutate.mock.calls[0][0];
    expect(body).toMatchObject({
      target_type: 'recommendation',
      target_id: 'AID-1',
      article_id: 'AID-1',
    });
    expect(screen.getByTestId('decision-footer-lifecycle-chip')).toHaveTextContent(
      /accepted/i,
    );
    // Iron rule §A: row stays visible.
    expect(screen.getByTestId('decision-footer-accept')).toBeInTheDocument();
  });

  it('Reject fires useDeclineDecision and keeps the row visible', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    fireEvent.click(screen.getByTestId('decision-footer-reject'));
    expect(declineMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('decision-footer-lifecycle-chip')).toHaveTextContent(
      /rejected/i,
    );
    expect(screen.getByTestId('decision-footer-reject')).toBeInTheDocument();
  });

  it('Snooze opens the popover; picking a preset fires useSnoozeDecision', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    fireEvent.click(screen.getByTestId('decision-footer-snooze'));
    expect(screen.getByTestId('decision-footer-snooze-popover')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('decision-footer-snooze-1w'));
    expect(snoozeMutate).toHaveBeenCalledTimes(1);
    const body = snoozeMutate.mock.calls[0][0];
    expect(body.target_id).toBe('AID-1');
    expect(body.until).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByTestId('decision-footer-lifecycle-chip')).toHaveTextContent(
      /snoozed/i,
    );
    expect(screen.getByTestId('decision-footer-snooze')).toBeInTheDocument();
  });

  it('Share opens the ShareDecisionDrawer', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    expect(screen.queryByTestId('mock-share-drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('decision-footer-share'));
    const dr = screen.getByTestId('mock-share-drawer');
    expect(dr).toBeInTheDocument();
    expect(dr).toHaveAttribute('data-aid', 'AID-1');
  });

  it('A/B Slice opens ABTestCard with control + variant prefilled', () => {
    wrap(
      <DecisionFooter
        data={data}
        activeOption={activeOption}
        currentPriceLabel="€118.00"
        proposalId="p-1"
      />,
    );
    fireEvent.click(screen.getByTestId('decision-footer-ab-slice'));
    expect(screen.getByTestId('decision-footer-ab-drawer')).toBeInTheDocument();
    const card = screen.getByTestId('mock-abtestcard');
    expect(card).toHaveAttribute('data-aid', 'AID-1');
    expect(card).toHaveAttribute('data-control', '118.00');
    expect(card).toHaveAttribute('data-variant', '127.00');
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
    fireEvent.click(screen.getByTestId('decision-footer-pdf'));
    expect(window.open).not.toHaveBeenCalled();
    const popover = screen.getByTestId('decision-footer-pdf-popover');
    expect(popover).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId('decision-footer-pdf-persona-till').querySelector('input')!,
    );
    fireEvent.click(
      screen.getByTestId('decision-footer-pdf-lang-de').querySelector('input')!,
    );
    fireEvent.click(screen.getByTestId('decision-footer-pdf-submit'));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/pricing\/proposals\/p-1\/pdf\?.*persona=till.*lang=de|\/pricing\/proposals\/p-1\/pdf\?.*lang=de.*persona=till/,
      ),
      '_blank',
      'noopener,noreferrer',
    );
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
