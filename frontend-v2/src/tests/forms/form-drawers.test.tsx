/**
 * Phase 3 — typed form drawers submit to the right backend kind.
 * Mocks the network at `runAction` and asserts the form posts the
 * shape the FastAPI dispatcher expects.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PartialAcceptForm } from '@/components/forms/PartialAcceptForm';
import { SnoozeForm } from '@/components/forms/SnoozeForm';
import { QueueRenewalForm } from '@/components/forms/QueueRenewalForm';
import { AbSetupForm } from '@/components/forms/AbSetupForm';
import { AbHoldPromoteForm } from '@/components/forms/AbHoldPromoteForm';

const runAction = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ replay: false, audit: {} }),
);
vi.mock('@/data/api/useActions', () => ({
  runAction,
  useAcceptDecision: () => ({}),
  useDeclineDecision: () => ({}),
  usePartialAccept: () => ({}),
  useStartAbTest: () => ({}),
  useStopAbTest: () => ({}),
}));

beforeEach(() => runAction.mockClear());

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const noop = () => {};
const ctx = {
  recommendationId: 'margin_erosion:200832-E',
  articleId: '200832-E',
  cluster: 'BKAES',
  sourceKind: 'margin_erosion',
  headline: 'Margin erosion 200832-E',
  currentPrice: 4.1,
  targetPrice: 4.38,
};

describe('PartialAcceptForm', () => {
  it('blocks submit until reason ≥ 6 chars and posts partial_accept', async () => {
    render(withQc(<PartialAcceptForm context={ctx} onClose={noop} onToast={noop} />));

    const submit = screen.getByRole('button', { name: /create draft proposal/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/0\.00/), { target: { value: '4.20' } });
    fireEvent.change(screen.getByPlaceholderText(/customer 102330/i), {
      target: { value: 'customer aligned partial pass-through' },
    });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(runAction).toHaveBeenCalled());
    const [kind, body] = runAction.mock.calls[0];
    expect(kind).toBe('partial_accept');
    expect(body.recommendation_id).toBe('margin_erosion:200832-E');
    expect(body.article_id).toBe('200832-E');
    expect(body.proposed_price).toBe(4.2);
    expect(body.after.variant).toBe('par');
  });
});

describe('SnoozeForm', () => {
  it('posts snooze_recommendation with future date + reason', async () => {
    render(withQc(<SnoozeForm context={ctx} onClose={noop} onToast={noop} />));
    fireEvent.change(screen.getByPlaceholderText(/waiting on Q3/i), {
      target: { value: 'cost data pending' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^snooze$/i }));
    await waitFor(() => expect(runAction).toHaveBeenCalled());
    const [kind, body] = runAction.mock.calls[0];
    expect(kind).toBe('snooze_recommendation');
    expect(body.after.snooze_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.after.reason).toBe('cost data pending');
  });
});

describe('QueueRenewalForm', () => {
  it('posts queue_renewal with renewal date, owner, and note', async () => {
    render(withQc(<QueueRenewalForm context={ctx} onClose={noop} onToast={noop} />));
    fireEvent.change(screen.getByPlaceholderText(/cost pass-through/i), {
      target: { value: 'pass-through behind 4pp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /queue renewal/i }));
    await waitFor(() => expect(runAction).toHaveBeenCalled());
    const [kind, body] = runAction.mock.calls[0];
    expect(kind).toBe('queue_renewal');
    expect(body.after.owner).toBe('till');
    expect(body.after.note).toBe('pass-through behind 4pp');
  });
});

describe('AbSetupForm', () => {
  it('posts start_ab_test with control/treatment/slice/duration', async () => {
    runAction.mockResolvedValueOnce({ replay: false, audit: { id: 'a', audit_hash: 'h', created_at: null } });
    render(withQc(<AbSetupForm context={ctx} onClose={noop} onToast={noop} />));
    fireEvent.click(screen.getByRole('button', { name: /start test/i }));
    await waitFor(() => expect(runAction).toHaveBeenCalled());
    const [kind, body] = runAction.mock.calls[0];
    expect(kind).toBe('start_ab_test');
    expect(body.aid).toBe('200832-E');
    expect(body.control_price).toBe(4.1);
    expect(body.treatment_price).toBe(4.38);
    expect(body.slice_pct).toBeCloseTo(0.1);
    expect(body.after.duration_days).toBe(21);
    // Phase 7 — top-level duration_days + success_metric for the dispatcher.
    expect(body.duration_days).toBe(21);
    expect(body.success_metric).toBe('margin_lift_pp');
  });

  it('renders the audit-trail receipt on a successful start (Phase 7)', async () => {
    runAction.mockResolvedValueOnce({
      replay: false,
      audit: { id: 'audit-xyz', audit_hash: 'deadbeef0102', created_at: '2026-05-12T10:00:00Z' },
      ab_test_id: 'abt-123',
      status: 'running',
      decision_state: 'running',
      simulation_status: 'pre_launch_ok',
      launch_readiness: 'ready',
      blockers: [],
      simulation_summary: { stage: 'pre_launch', recommendation: 'launch', detected_lift_pp: 6.8, blockers: [] },
    });
    render(withQc(<AbSetupForm context={ctx} onClose={noop} onToast={noop} />));
    fireEvent.click(screen.getByRole('button', { name: /start test/i }));
    const receipt = await screen.findByTestId('ab-receipt');
    expect(receipt).toBeInTheDocument();
    expect(screen.getByText(/A\/B test started/)).toBeInTheDocument();
    expect(screen.getByTestId('audit-hash')).toHaveTextContent('deadbeef0102');
    expect(screen.getByTestId('ab-test-id')).toHaveTextContent('abt-123');
    expect(screen.getByText(/All pre-launch checks passed/)).toBeInTheDocument();
    expect(screen.getByText(/\+6\.8pp/)).toBeInTheDocument();
  });

  it('renders the blocked receipt with the blocker list (Phase 7)', async () => {
    runAction.mockResolvedValueOnce({
      replay: false,
      audit: { id: 'audit-zzz', audit_hash: 'aabbccdd', created_at: '2026-05-12T10:00:00Z' },
      ab_test_id: 'abt-456',
      status: 'running',
      decision_state: 'running',
      launch_readiness: 'blocked',
      blockers: ['Slice exceeds 40% — capacity risk'],
      simulation_summary: { stage: 'pre_launch', recommendation: 'block', blockers: ['Slice exceeds 40% — capacity risk'] },
    });
    render(withQc(<AbSetupForm context={ctx} onClose={noop} onToast={noop} />));
    fireEvent.click(screen.getByRole('button', { name: /start test/i }));
    expect(await screen.findByTestId('ab-receipt')).toBeInTheDocument();
    expect(screen.getByText(/A\/B test recorded — blocked/)).toBeInTheDocument();
    expect(screen.getByText('Slice exceeds 40% — capacity risk')).toBeInTheDocument();
  });
});

describe('AbHoldPromoteForm', () => {
  const abCtx = { ...ctx, abTestId: 'ab-1' };

  it('hold posts hold_ab_test with selected reason', async () => {
    render(withQc(<AbHoldPromoteForm context={abCtx} onClose={noop} onToast={noop} mode="hold" />));
    fireEvent.click(screen.getByRole('button', { name: /put on hold/i }));
    await waitFor(() => expect(runAction).toHaveBeenCalled());
    const [kind, body] = runAction.mock.calls[0];
    expect(kind).toBe('hold_ab_test');
    expect(body.test_id).toBe('ab-1');
    expect(body.after.reason).toBeTruthy();
  });

  it('promote stays disabled until MD-approval is acknowledged, then posts promote_ab_test', async () => {
    render(withQc(<AbHoldPromoteForm context={abCtx} onClose={noop} onToast={noop} mode="promote" />));
    const submit = screen.getByRole('button', { name: /promote to rollout/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /MD approval/i }));
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() => expect(runAction).toHaveBeenCalled());
    const [kind, body] = runAction.mock.calls[0];
    expect(kind).toBe('promote_ab_test');
    expect(body.test_id).toBe('ab-1');
    expect(body.after.approval_acknowledged).toBe(true);
  });
});
