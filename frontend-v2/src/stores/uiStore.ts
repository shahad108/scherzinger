import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Density } from '@/types';

interface UiState {
  density: Density;
  sidebarCollapsed: boolean;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      density: 'cozy',
      sidebarCollapsed: false,
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'pryzm-v2-ui' },
  ),
);
