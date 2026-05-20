import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Persona } from '@/types';

interface PersonaState {
  persona: Persona;
  setPersona: (p: Persona) => void;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set) => ({
      persona: 'frank',
      setPersona: (persona) => set({ persona }),
    }),
    { name: 'pryzm-v2-persona' },
  ),
);
