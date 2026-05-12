import type { NavigateFunction } from 'react-router-dom';
import { runAction } from '@/data/api/useActions';
import type { ActionDrawerIntent, ActionIntent } from '@/types/uiActions';
import type { Severity } from '@/types';
import { hasPermission, useAuthStore } from '@/stores/authStore';

export interface UiActionDeps {
  navigate: NavigateFunction;
  toast: (message: string, severity?: Severity) => void;
  drawer: (drawer: ActionDrawerIntent) => void;
  mutate?: typeof runAction;
}

function buildTo(intent: ActionIntent): string | null {
  if (!intent.route) return null;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(intent.query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  return `${intent.route}${qs.toString() ? `?${qs}` : ''}${intent.hash ? `#${intent.hash}` : ''}`;
}

export async function executeUiAction(intent: ActionIntent, deps: UiActionDeps): Promise<void> {
  if (intent.disabledReason) {
    deps.toast(intent.disabledReason, 'warning');
    return;
  }

  if (intent.requiredPermission) {
    const user = useAuthStore.getState().user;
    if (!hasPermission(user, intent.requiredPermission)) {
      deps.toast(
        intent.permissionDeniedReason ?? 'You do not have permission for this action.',
        'warning',
      );
      return;
    }
  }

  if (intent.drawer) deps.drawer(intent.drawer);

  const to = buildTo(intent);

  if (intent.kind) {
    const mutate = deps.mutate ?? runAction;
    if (intent.optimistic && to) deps.navigate(to);
    const mutation = mutate(intent.kind, {
      target_type: intent.targetType,
      target_id: intent.targetId,
      ...(intent.body ?? {}),
    });
    await mutation;
  }

  if (to && !intent.optimistic) deps.navigate(to);

  if (intent.toast) deps.toast(intent.toast, intent.toastSeverity ?? 'success');
}
