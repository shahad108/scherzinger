import { create } from 'zustand';
import type { Persona } from '@/types';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  ui_persona: Persona;
  roles: string[];
  permissions: string[];
  features: string[];
}

interface AuthState {
  user: MeUser | null;
  isLoading: boolean;
  setUser: (user: MeUser | null) => void;
  setLoading: (v: boolean) => void;
  logout: () => void;
}

// NOT persisted: cookies are the source of truth, not localStorage.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ user: null, isLoading: false }),
}));

export function hasPermission(user: MeUser | null, name: string): boolean {
  return !!user && user.permissions.includes(name);
}
