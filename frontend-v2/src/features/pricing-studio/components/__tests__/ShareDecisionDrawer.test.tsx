// Pricing Studio v3 / Phase F (F4) — ShareDecisionDrawer tests.
//
// Asserts:
//   * Radio group renders 3 options (Till, Heiko, Both).
//   * Submit is disabled until a recipient is picked.
//   * Submit calls useShareDecision with target_id + payload.recipient.
//   * "Both" fans out into two requests.
//   * Drawer closes on successful submit.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ShareDecisionDrawer } from '../ShareDecisionDrawer';

const shareMutateAsync = vi.fn();

vi.mock('@/data/api/useActions', async (orig) => {
  const real = await orig<typeof import('@/data/api/useActions')>();
  return {
    ...real,
    useShareDecision: () => ({
      mutate: vi.fn(),
      mutateAsync: shareMutateAsync,
      isPending: false,
    }),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseProps = {
  articleId: 'AID-1',
  recommendationId: 'rec-42',
  headline: 'AID-1 → €127.00',
};

describe('ShareDecisionDrawer', () => {
  beforeEach(() => {
    shareMutateAsync.mockReset();
    shareMutateAsync.mockResolvedValue({ replay: false });
  });

  it('renders three recipient radio options when open', () => {
    wrap(<ShareDecisionDrawer open onOpenChange={() => {}} {...baseProps} />);
    expect(screen.getByTestId('share-decision-recipient-till')).toBeInTheDocument();
    expect(screen.getByTestId('share-decision-recipient-heiko')).toBeInTheDocument();
    expect(screen.getByTestId('share-decision-recipient-both')).toBeInTheDocument();
  });

  it('disables Submit until a recipient is picked', () => {
    wrap(<ShareDecisionDrawer open onOpenChange={() => {}} {...baseProps} />);
    const submit = screen.getByTestId('share-decision-submit');
    expect(submit).toBeDisabled();
    fireEvent.click(
      screen
        .getByTestId('share-decision-recipient-till')
        .querySelector('input')!,
    );
    expect(submit).not.toBeDisabled();
  });

  it('Submit calls useShareDecision with target_id + payload.recipient for a single recipient', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <ShareDecisionDrawer
        open
        onOpenChange={onOpenChange}
        {...baseProps}
      />,
    );
    fireEvent.click(
      screen
        .getByTestId('share-decision-recipient-till')
        .querySelector('input')!,
    );
    fireEvent.change(screen.getByTestId('share-decision-note'), {
      target: { value: 'fyi' },
    });
    fireEvent.click(screen.getByTestId('share-decision-submit'));
    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(1));
    const body = shareMutateAsync.mock.calls[0][0];
    expect(body.target_id).toBe('rec-42');
    expect(body.aid).toBe('AID-1');
    expect(body.recipient).toBe('till');
    expect(body.note).toBe('fyi');
    expect(body.payload).toMatchObject({
      recipient: 'till',
      note: 'fyi',
      target_id: 'rec-42',
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('Both fans out into two requests (till + heiko)', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <ShareDecisionDrawer
        open
        onOpenChange={onOpenChange}
        {...baseProps}
      />,
    );
    fireEvent.click(
      screen
        .getByTestId('share-decision-recipient-both')
        .querySelector('input')!,
    );
    fireEvent.click(screen.getByTestId('share-decision-submit'));
    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(2));
    const recipients = shareMutateAsync.mock.calls.map(
      (call) => (call[0] as { recipient: string }).recipient,
    );
    expect(recipients).toEqual(['till', 'heiko']);
  });

  it('falls back to articleId as target_id when recommendationId is null', async () => {
    wrap(
      <ShareDecisionDrawer
        open
        onOpenChange={() => {}}
        articleId="AID-X"
        recommendationId={null}
        headline={null}
      />,
    );
    fireEvent.click(
      screen
        .getByTestId('share-decision-recipient-heiko')
        .querySelector('input')!,
    );
    fireEvent.click(screen.getByTestId('share-decision-submit'));
    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(1));
    const body = shareMutateAsync.mock.calls[0][0];
    expect(body.target_id).toBe('AID-X');
    expect(body.aid).toBe('AID-X');
    expect(body.recipient).toBe('heiko');
  });

  it('shows the note character counter and clamps at 280', () => {
    wrap(<ShareDecisionDrawer open onOpenChange={() => {}} {...baseProps} />);
    const ta = screen.getByTestId('share-decision-note') as HTMLTextAreaElement;
    const long = 'x'.repeat(400);
    fireEvent.change(ta, { target: { value: long } });
    expect(ta.value.length).toBe(280);
    expect(screen.getByTestId('share-decision-note-count')).toHaveTextContent(
      '280/280',
    );
  });
});
