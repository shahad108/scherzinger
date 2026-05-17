// Pricing Studio v3 / Phase 10 — German-language toggle.
//
// Two-tab switch in the top-bar (or account menu). Reads the user's
// current language preference and writes back via PUT
// /api/v1/users/me/language. Successful writes invalidate every query
// in the cache so all language-sensitive surfaces (briefing, PDF,
// persona-toggled rationale, future translated copy) refetch.
//
// v3 coverage is partial: most of the FE copy is English. The German
// tab carries a small "Beta" badge to signal that. The BFF's briefing
// endpoint + PDF generator already honour the `lang` query param.

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useSetUserLanguage,
  useUserLanguage,
  type UserLanguage,
} from '@/data/api/useUserLanguage';

interface Props {
  /** Optional className passed to the outer pill. */
  className?: string;
}

const OPTIONS: { value: UserLanguage; label: string; beta?: boolean }[] = [
  { value: 'en', label: 'EN' },
  { value: 'de', label: 'DE', beta: true },
];

export function LanguageToggle({ className }: Props) {
  const { lang } = useUserLanguage();
  const setLang = useSetUserLanguage();
  // Optimistic local mirror so the active tab updates the moment the user
  // clicks (the mutation invalidates everything which takes a beat).
  const [active, setActive] = useState<UserLanguage>(lang);
  useEffect(() => {
    setActive(lang);
  }, [lang]);

  function handleClick(next: UserLanguage) {
    if (next === active || setLang.isPending) return;
    setActive(next);
    setLang.mutate(next, {
      onError: () => setActive(lang), // revert on failure
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      data-testid="language-toggle"
      data-lang={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-white p-0.5',
        className,
      )}
    >
      <Globe size={12} aria-hidden="true" className="ml-1.5 text-[var(--muted)]" />
      {OPTIONS.map((opt) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`language-toggle-${opt.value}`}
            aria-pressed={isActive}
            disabled={setLang.isPending}
            onClick={() => handleClick(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] transition-colors',
              isActive
                ? 'bg-[var(--rose-bg)] text-[var(--rose-deep)]'
                : 'text-[var(--muted)] hover:bg-[var(--surface-soft)]',
              setLang.isPending && 'cursor-progress opacity-70',
            )}
          >
            <span>{opt.label}</span>
            {opt.beta && (
              <span
                data-testid={`language-toggle-${opt.value}-beta`}
                className="rounded-full bg-[var(--amber-bg)] px-1 py-[1px] text-[8.5px] font-bold uppercase tracking-wider text-[var(--amber)]"
                aria-label="Beta — partial coverage"
                title="German coverage is partial in v3 — briefing + PDF honour the lang param, most UI copy is still English."
              >
                Beta
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
