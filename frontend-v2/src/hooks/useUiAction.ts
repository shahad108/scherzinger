import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { executeUiAction } from '@/lib/uiActions';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
import type { ActionIntent } from '@/types/uiActions';

export function useUiAction() {
  const navigate = useNavigate();
  const toast = useActionFeedbackStore((s) => s.pushToast);
  const drawer = useActionFeedbackStore((s) => s.openDrawer);

  return useCallback(
    (intent: ActionIntent) =>
      executeUiAction(intent, { navigate, toast, drawer }).catch((err) => {
        toast((err as Error).message, 'error');
      }),
    [drawer, navigate, toast],
  );
}
