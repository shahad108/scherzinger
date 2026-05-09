import { useNavigate } from 'react-router-dom';
import { analytics } from '@/lib/analytics';
import { usePersonaStore } from '@/stores/personaStore';
import { useAuthStore } from '@/stores/authStore';
import type { Persona } from '@/types';

interface PersonaSpec {
  id: Persona;
  label: string;
  /** Required permission to switch into this persona (Phase 2 RBAC). */
  requires: string;
  /** Default landing route when this persona is activated. */
  landing: string;
}

const PERSONAS: readonly PersonaSpec[] = [
  { id: 'frank', label: 'Frank', requires: 'view.action_center', landing: '/action-center' },
  { id: 'till', label: 'Till', requires: 'act.approve_md_authority', landing: '/md/overview' },
  { id: 'heiko', label: 'Heiko', requires: 'view.quotes:own', landing: '/deal/inbox' },
] as const;

export function PersonaSwitcher() {
  const persona = usePersonaStore((s) => s.persona);
  const setPersona = usePersonaStore((s) => s.setPersona);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div className="pz-persona" role="tablist" aria-label="Persona">
      {PERSONAS.map((p) => {
        const allowed = !!user && user.permissions.includes(p.requires);
        const active = persona === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!allowed}
            title={allowed ? undefined : 'Erfordert höhere Berechtigung'}
            className={active ? 'active' : undefined}
            onClick={() => {
              if (!allowed || active) return;
              const from = persona;
              setPersona(p.id);
              analytics.track('persona_switched', { from, to: p.id });
              navigate(p.landing);
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
