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

function handleScroll(anchor: string): void {
  // Guard against SSR/jsdom where document may exist but querySelector
  // returns null (no DOM mounted yet). Caller still resolves intent OK.
  if (typeof document === 'undefined') return;
  try {
    const target = document.querySelector(anchor);
    if (target && typeof (target as HTMLElement).scrollIntoView === 'function') {
      (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch {
    // Invalid selector — fail silently rather than break the page.
  }
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

  // Smooth in-page scroll intents — additive, fires before any
  // navigation/mutation so the page lands on the right block before any
  // async work completes.
  if (intent.scroll) handleScroll(intent.scroll);

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

  // Skip route navigation when the intent is purely a scroll-with-query
  // (e.g. recoverable_margin tile applies queue=margin without leaving
  // the Action Center page). A pure scroll intent has no ``route``.
  if (to && !intent.optimistic && !intent.scroll) deps.navigate(to);

  if (intent.toast) deps.toast(intent.toast, intent.toastSeverity ?? 'success');
}
