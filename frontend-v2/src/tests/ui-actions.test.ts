import { describe, expect, it, vi } from 'vitest';
import { executeUiAction } from '@/lib/uiActions';
import type { UiActionDeps } from '@/lib/uiActions';
import { useAuthStore } from '@/stores/authStore';

function deps(): UiActionDeps {
  return {
    navigate: vi.fn(),
    toast: vi.fn(),
    drawer: vi.fn(),
    mutate: vi.fn().mockResolvedValue({ replay: false, audit: {} }),
  };
}

describe('executeUiAction', () => {
  it('awaits blocking mutations before navigating', async () => {
    const d = deps();
    const steps: string[] = [];
    d.mutate = vi.fn().mockImplementation(async () => {
      steps.push('mutate:start');
      await Promise.resolve();
      steps.push('mutate:end');
      return { replay: false, audit: {} };
    });
    d.navigate = vi.fn(() => {
      steps.push('navigate');
    });

    await executeUiAction(
      {
        kind: 'studio_accept',
        targetType: 'recommendation',
        targetId: 'rec-1',
        route: '/pricing',
      },
      d,
    );

    expect(steps).toEqual(['mutate:start', 'mutate:end', 'navigate']);
  });

  it('lets explicit optimistic intents navigate before the mutation settles', async () => {
    const d = deps();
    const steps: string[] = [];
    let resolveMutation!: () => void;
    d.mutate = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          steps.push('mutate:start');
          resolveMutation = () => {
            steps.push('mutate:end');
            resolve({ replay: false, audit: {} });
          };
        }),
    );
    d.navigate = vi.fn(() => {
      steps.push('navigate');
    });

    const run = executeUiAction(
      {
        kind: 'accept_recommendation',
        targetType: 'recommendation',
        targetId: 'rec-1',
        route: '/pricing',
        optimistic: true,
      },
      d,
    );

    expect(steps).toEqual(['navigate', 'mutate:start']);
    resolveMutation();
    await run;
    expect(steps).toEqual(['navigate', 'mutate:start', 'mutate:end']);
  });

  it('navigates with query, hash, and success toast', async () => {
    const d = deps();
    await executeUiAction(
      {
        route: '/pricing',
        query: { aid: '200832-E', empty: undefined },
        hash: 'queue',
        toast: 'Opening studio',
      },
      d,
    );

    expect(d.navigate).toHaveBeenCalledWith('/pricing?aid=200832-E#queue');
    expect(d.toast).toHaveBeenCalledWith('Opening studio', 'success');
  });

  it('opens drawers without requiring navigation', async () => {
    const d = deps();
    const drawer = { title: 'Trust details', description: 'Model evidence' };
    await executeUiAction({ drawer, toast: 'Opened', toastSeverity: 'info' }, d);

    expect(d.drawer).toHaveBeenCalledWith(drawer);
    expect(d.toast).toHaveBeenCalledWith('Opened', 'info');
  });

  it('runs mutation intents through the action endpoint', async () => {
    const d = deps();
    await executeUiAction(
      {
        kind: 'stop_ab_test',
        targetType: 'ab_test',
        targetId: 'ab-1',
        body: { after: { status: 'stopped' } },
      },
      d,
    );

    expect(d.mutate).toHaveBeenCalledWith('stop_ab_test', {
      target_type: 'ab_test',
      target_id: 'ab-1',
      after: { status: 'stopped' },
    });
  });

  it('turns disabled actions into warning feedback', async () => {
    const d = deps();
    await executeUiAction({ disabledReason: 'Backend required', route: '/pricing' }, d);

    expect(d.toast).toHaveBeenCalledWith('Backend required', 'warning');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('blocks actions when the required permission is missing', async () => {
    const d = deps();
    useAuthStore.setState({
      user: {
        id: 'u-1',
        email: 'frank@scherzinger.de',
        name: 'Frank Klein',
        ui_persona: 'frank',
        roles: ['analyst'],
        permissions: ['view.action_center'],
        features: [],
      },
      isLoading: false,
    });

    await executeUiAction(
      {
        route: '/pricing',
        requiredPermission: 'act.start_ab_test',
        permissionDeniedReason: 'You are not allowed to start A/B tests from this workspace.',
      },
      d,
    );

    expect(d.mutate).not.toHaveBeenCalled();
    expect(d.navigate).not.toHaveBeenCalled();
    expect(d.toast).toHaveBeenCalledWith(
      'You are not allowed to start A/B tests from this workspace.',
      'warning',
    );
    useAuthStore.setState({ user: null, isLoading: false });
  });
});
