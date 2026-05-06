import { usePersonaStore } from '@/stores/personaStore';

export function usePersona() {
  const persona = usePersonaStore((s) => s.persona);
  const setPersona = usePersonaStore((s) => s.setPersona);
  return { persona, setPersona };
}
