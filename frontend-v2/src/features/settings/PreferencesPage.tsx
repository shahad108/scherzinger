// Phase 14 P14.T2 — Preferences (density, persona default, briefing cadence,
// notification toggles).
import { usePatchPreferences, usePreferences } from '@/data/api/useSettings';

const cadences = ['daily', 'weekly', 'off'] as const;
const densities = ['comfortable', 'compact'] as const;
const personas = ['frank', 'till', 'heiko'] as const;

export default function PreferencesPage() {
  const { data: p, isLoading } = usePreferences();
  const patch = usePatchPreferences();

  if (isLoading || !p) {
    return <div className="text-[13px] text-[var(--muted)]">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Density</h2>
        <div className="flex gap-2">
          {densities.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => patch.mutate({ density: d })}
              aria-pressed={p.density === d}
              className={`rounded-[10px] border px-4 py-2 text-[13px] font-semibold transition-colors ${
                p.density === d
                  ? 'border-[var(--rose)] bg-[var(--rose)] text-white'
                  : 'border-[var(--border)] bg-white text-[var(--ink-2)]'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Default persona</h2>
        <div className="flex gap-2">
          {personas.map((persona) => (
            <button
              key={persona}
              type="button"
              onClick={() => patch.mutate({ default_persona: persona })}
              aria-pressed={p.default_persona === persona}
              className={`rounded-[10px] border px-4 py-2 text-[13px] font-semibold capitalize transition-colors ${
                p.default_persona === persona
                  ? 'border-[var(--rose)] bg-[var(--rose)] text-white'
                  : 'border-[var(--border)] bg-white text-[var(--ink-2)]'
              }`}
            >
              {persona}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Briefing email cadence</h2>
        <div className="flex gap-2">
          {cadences.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch.mutate({ briefing_email_cadence: c })}
              aria-pressed={p.briefing_email_cadence === c}
              className={`rounded-[10px] border px-4 py-2 text-[13px] font-semibold capitalize transition-colors ${
                p.briefing_email_cadence === c
                  ? 'border-[var(--rose)] bg-[var(--rose)] text-white'
                  : 'border-[var(--border)] bg-white text-[var(--ink-2)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Notifications</h2>
        <div className="flex flex-col gap-2 text-[13px]">
          {(
            [
              ['notify_quotes', 'Quote events'],
              ['notify_margin', 'Margin alerts'],
              ['notify_pro', 'PRO mode + new SKU'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p[key]}
                onChange={(e) => patch.mutate({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
