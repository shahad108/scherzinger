import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Density } from '@/types';

interface UiState {
  density: Density;
  sidebarCollapsed: boolean;
  rightRailCollapsed: boolean;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
  toggleRightRail: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      density: 'cozy',
      sidebarCollapsed: false,
      rightRailCollapsed: false,
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleRightRail: () => set((s) => ({ rightRailCollapsed: !s.rightRailCollapsed })),
    }),
    { name: 'pryzm-v2-ui' },
  ),
);
