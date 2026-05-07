import { usePersonaStore } from '@/stores/personaStore';

const personas = [
  { id: 'frank', label: 'Frank' },
  { id: 'till', label: 'Till', external: '/demo/#?persona=md' },
  { id: 'heiko', label: 'Heiko', external: '/demo/#?persona=sr' },
] as const;

export function PersonaSwitcher() {
  const persona = usePersonaStore((s) => s.persona);
  const setPersona = usePersonaStore((s) => s.setPersona);

  return (
    <div className="pz-persona" role="tablist" aria-label="Persona">
      {personas.map((p) => {
        const active = persona === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'active' : undefined}
            onClick={() => {
              if ('external' in p && p.external) {
                window.location.assign(p.external);
                return;
              }
              setPersona(p.id);
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
