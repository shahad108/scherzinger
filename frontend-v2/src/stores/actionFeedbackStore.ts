import { create } from 'zustand';
import type { Severity } from '@/types';
import type { ActionDrawerIntent } from '@/types/uiActions';

export interface ActionToast {
  id: string;
  message: string;
  severity: Severity;
}

interface ActionFeedbackState {
  toasts: ActionToast[];
  drawer: ActionDrawerIntent | null;
  pushToast: (message: string, severity?: Severity) => void;
  dismissToast: (id: string) => void;
  openDrawer: (drawer: ActionDrawerIntent) => void;
  closeDrawer: () => void;
}

export const useActionFeedbackStore = create<ActionFeedbackState>((set) => ({
  toasts: [],
  drawer: null,
  pushToast: (message, severity = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, severity }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openDrawer: (drawer) => set({ drawer }),
  closeDrawer: () => set({ drawer: null }),
}));
