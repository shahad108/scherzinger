// Pricing Studio v3 / 2026-05-19 coherence pass — Email draft drawer.
//
// Opens from the RationaleMemo "Email to Till" button. Calls
// POST /briefing/sku/{aid}/email-draft on mount (and on persona switch),
// renders the returned {subject, body_md} as two editable fields, and
// exposes a "Copy to clipboard" + an "Open in mail client" (mailto:)
// action so Frank can finish the workflow without leaving the page.

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useEmailDraft, type EmailDraftRequest } from '@/data/api/useEmailDraft';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aid: string;
  defaultPersona?: 'frank' | 'till' | 'manuel';
  defaultLang?: 'en' | 'de';
  proposedPrice?: string | null;
}

const PERSONA_OPTIONS: Array<{ value: 'frank' | 'till' | 'manuel'; label: string }> = [
  { value: 'till', label: 'Till · CFO' },
  { value: 'frank', label: 'Frank · Analyst' },
  { value: 'manuel', label: 'Manuel · Sales' },
];

const LANG_OPTIONS: Array<{ value: 'en' | 'de'; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];

export function EmailDraftDrawer({
  open,
  onOpenChange,
  aid,
  defaultPersona = 'till',
  defaultLang = 'en',
  proposedPrice = null,
}: Props) {
  const draft = useEmailDraft(aid);
  const [persona, setPersona] = useState<EmailDraftRequest['persona']>(defaultPersona);
  const [lang, setLang] = useState<EmailDraftRequest['lang']>(defaultLang);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);

  // Re-fetch when the drawer opens or persona/lang change.
  useEffect(() => {
    if (!open || !aid) return;
    draft.mutate(
      { persona, lang, proposed_price: proposedPrice ?? undefined },
      {
        onSuccess: (data) => {
          setSubject(data.subject);
          setBody(data.body_md);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aid, persona, lang, proposedPrice]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      const text = `${subject}\n\n${body}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard denied — user can still select+copy. */
    }
  };

  const onMailto = () => {
    const recipient =
      persona === 'till'
        ? 'till@scherzinger.de'
        : persona === 'manuel'
          ? 'manuel@scherzinger.de'
          : 'frank@scherzinger.de';
    const href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} width={560} title="Email draft">
      <div
        data-testid="email-draft-drawer"
        className="flex h-full flex-col"
      >
        <header
          className="px-6 pb-4 pt-6"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">
            Email draft — Article {aid}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">
            Pre-filled by the briefing service. Edit, copy, or open in your mail client.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[12px]">
            <label className="flex items-center gap-1">
              <span className="font-semibold text-[var(--ink-3)]">To</span>
              <select
                value={persona}
                onChange={(e) =>
                  setPersona(e.target.value as EmailDraftRequest['persona'])
                }
                className="rounded border border-[var(--hairline)] bg-white px-2 py-[2px]"
              >
                {PERSONA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="font-semibold text-[var(--ink-3)]">Lang</span>
              <select
                value={lang}
                onChange={(e) =>
                  setLang(e.target.value as EmailDraftRequest['lang'])
                }
                className="rounded border border-[var(--hairline)] bg-white px-2 py-[2px]"
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {draft.isPending ? (
            <p className="text-[12.5px] italic text-[var(--ink-2)]">Drafting…</p>
          ) : draft.isError ? (
            <p
              role="alert"
              className="text-[12.5px] text-[var(--red)]"
              data-testid="email-draft-error"
            >
              Could not draft the email: {(draft.error as Error).message}
            </p>
          ) : (
            <>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mb-4 w-full rounded border border-[var(--hairline)] bg-white px-3 py-2 text-[13px] font-semibold text-[var(--ink)]"
                data-testid="email-draft-subject"
              />
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={18}
                className="w-full rounded border border-[var(--hairline)] bg-white px-3 py-2 text-[13px] text-[var(--ink)] font-mono"
                data-testid="email-draft-body"
              />
            </>
          )}
        </div>

        <footer
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: '1px solid var(--hairline)' }}
        >
          <span className="mr-auto text-[10.5px] text-[var(--ink-3)]">
            {draft.data?.model
              ? `Generated by ${draft.data.model}`
              : 'Briefing service'}
          </span>
          <button
            type="button"
            className="btn"
            onClick={onCopy}
            disabled={draft.isPending || !subject}
            data-testid="email-draft-copy"
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onMailto}
            disabled={draft.isPending || !subject}
            data-testid="email-draft-mailto"
          >
            ✉ Open in mail
          </button>
        </footer>
      </div>
    </Drawer>
  );
}
