import { describe, expect, it, vi } from 'vitest';
import { executeUiAction } from '@/lib/uiActions';
import type { UiActionDeps } from '@/lib/uiActions';

function deps(): UiActionDeps {
  return {
    navigate: vi.fn(),
    toast: vi.fn(),
    drawer: vi.fn(),
    mutate: vi.fn().mockResolvedValue({ replay: false, audit: {} }),
  };
}

describe('executeUiAction', () => {
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
});
