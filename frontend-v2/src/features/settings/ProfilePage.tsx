// Phase 14 P14.T2 — Profile page (name, email, language pill, density).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { usePatchProfile, usePatchPreferences, usePreferences } from '@/data/api/useSettings';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const { i18n } = useTranslation();
  const { data: prefs } = usePreferences();
  const patchPrefs = usePatchPreferences();
  const patchProfile = usePatchProfile();
  // Route is gated by RequireAuth so `user` is populated on mount; lazy
  // initial state avoids a useEffect→setState dance.
  const [name, setName] = useState(() => user?.name ?? '');

  const lang = (prefs?.language ?? i18n.language ?? 'de').slice(0, 2).toLowerCase();

  const setLanguage = async (next: 'de' | 'en') => {
    await i18n.changeLanguage(next);
    patchPrefs.mutate({ language: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Profile</h2>
        <div className="flex flex-col gap-3 max-w-md">
          <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--ink)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
            Email
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-[13px] text-[var(--muted)]"
            />
          </label>
          <button
            type="button"
            disabled={patchProfile.isPending || name === user?.name}
            onClick={() => patchProfile.mutate({ name })}
            className="self-start rounded-[10px] bg-[var(--rose)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Save name
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Language</h2>
        <div className="flex gap-2">
          {(['de', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              aria-pressed={lang === l}
              className={`rounded-[10px] border px-4 py-2 text-[13px] font-semibold transition-colors ${
                lang === l
                  ? 'border-[var(--rose)] bg-[var(--rose)] text-white'
                  : 'border-[var(--border)] bg-white text-[var(--ink-2)]'
              }`}
            >
              {l === 'de' ? 'Deutsch' : 'English'}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
