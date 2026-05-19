// Pricing Studio v3 / Phase F (F4) — Share Decision Drawer.
//
// Right-rail drawer opened from DecisionFooter's "Share" button. Lets Frank
// fan a Pricing-Studio decision out to Till (CFO) or Heiko (Sales KAM) — or
// both. The backend's `share_decision` action accepts `till`, `heiko`, or
// `both`; when `both` is passed the backend transactionally writes one
// notification per persona (single audit row, single sender note). The
// frontend therefore makes exactly one mutation per click.
//
// Design language: Pryzm 2026 — rounded-2xl, hairline borders, warm-gray
// surface, rose primary. Mirrors PublishConfirmationDrawer in look + feel.

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useShareDecision } from '@/data/api/useActions';
import { useUiAction } from '@/hooks/useUiAction';

const NOTE_MAX = 280;

export type ShareRecipient = 'till' | 'heiko' | 'both';

const RECIPIENT_OPTIONS: { value: ShareRecipient; label: string; sub: string }[] = [
  { value: 'till', label: 'Till', sub: 'CFO' },
  { value: 'heiko', label: 'Heiko', sub: 'Sales KAM' },
  { value: 'both', label: 'Both', sub: 'Till + Heiko' },
];

const FRIENDLY_LABEL: Record<ShareRecipient, string> = {
  till: 'Till',
  heiko: 'Heiko',
  both: 'Till + Heiko',
};

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The article we're sharing context on (decision.summary.aid). */
  articleId: string;
  /** Recommendation id from the URL (?recommendation=), if any. */
  recommendationId: string | null;
  /** Short title for the recipient's inbox row, e.g. the proposed price line. */
  headline?: string | null;
}

export function ShareDecisionDrawer({
  open,
  onOpenChange,
  articleId,
  recommendationId,
  headline,
}: Props) {
  const share = useShareDecision();
  const runUiAction = useUiAction();
  const [recipient, setRecipient] = useState<ShareRecipient | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the drawer is (re)opened — avoids stale picks
  // bleeding across recommendations.
  useEffect(() => {
    if (open) {
      setRecipient(null);
      setNote('');
      setError(null);
    }
  }, [open]);

  const targetId = recommendationId ?? articleId;
  const noteText = note.trim();
  const noteLen = note.length;

  const submitDisabled = recipient == null || share.isPending;

  async function handleSubmit() {
    if (!recipient) return;
    setError(null);
    try {
      // Backend now natively fans "both" into one notification per persona
      // inside a single transaction — no client-side loop needed.
      await share.mutateAsync({
        target_id: targetId,
        aid: articleId,
        recommendation_id: recommendationId ?? undefined,
        payload: {
          recipient,
          note: noteText.length ? noteText : null,
          target_id: targetId,
        },
        // Top-level mirror so the backend's body.get('recipient') /
        // body.get('note') reach _share_decision regardless of whether
        // payload-unwrap is enabled.
        recipient,
        note: noteText.length ? noteText : null,
        headline: headline ?? `Decision ${articleId}`,
      });
      runUiAction({
        toast: `Shared with ${FRIENDLY_LABEL[recipient]}.`,
      });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || 'Could not share the decision.');
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      title="Share decision"
    >
      <div
        className="flex h-full flex-col"
        data-testid="share-decision-drawer"
      >
        <header
          className="px-6 pb-4 pt-6"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">
            Share decision with…
          </h3>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">
            Sends an inbox notification to the recipient with a link back to
            this recommendation.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div
            role="radiogroup"
            aria-label="Recipient"
            className="flex flex-col gap-2"
            data-testid="share-decision-recipients"
          >
            {RECIPIENT_OPTIONS.map((opt) => {
              const active = recipient === opt.value;
              return (
                <label
                  key={opt.value}
                  data-testid={`share-decision-recipient-${opt.value}`}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors"
                  style={{
                    borderColor: active
                      ? 'var(--rose, #f43f5e)'
                      : 'var(--hairline)',
                    background: active
                      ? 'color-mix(in oklab, var(--rose, #f43f5e) 6%, white)'
                      : 'var(--surface, #fff)',
                  }}
                >
                  <input
                    type="radio"
                    name="share-decision-recipient"
                    value={opt.value}
                    checked={active}
                    onChange={() => setRecipient(opt.value)}
                    style={{ accentColor: 'var(--rose, #f43f5e)' }}
                  />
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-[var(--ink)]">
                      {opt.label}
                    </span>
                    <span className="text-[11.5px] text-[var(--ink-3)]">
                      {opt.sub}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <label className="mt-5 block">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-medium text-[var(--ink-2)]">
                Note (optional)
              </span>
              <span
                className="text-[11px] tabular-nums"
                data-testid="share-decision-note-count"
                style={{
                  color:
                    noteLen > NOTE_MAX
                      ? 'var(--red, #dc2626)'
                      : 'var(--ink-3)',
                }}
              >
                {noteLen}/{NOTE_MAX}
              </span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              rows={4}
              placeholder="Add context for the recipient…"
              data-testid="share-decision-note"
              className="w-full rounded-2xl border px-3 py-2 text-[12.5px] outline-none"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--surface, #fff)',
                color: 'var(--ink)',
              }}
            />
          </label>

          {error && (
            <div
              role="alert"
              data-testid="share-decision-error"
              className="mt-3 rounded-2xl px-3 py-2 text-[12px]"
              style={{
                border: '1px solid var(--red, #dc2626)',
                background:
                  'color-mix(in oklab, var(--red, #dc2626) 8%, white)',
                color: 'var(--red, #dc2626)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <footer
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{
            borderTop: '1px solid var(--hairline)',
            background: 'var(--surface, #fff)',
          }}
        >
          <button
            type="button"
            data-testid="share-decision-cancel"
            onClick={() => onOpenChange(false)}
            className="rounded-2xl border px-4 py-2 text-[12.5px] font-medium"
            style={{
              borderColor: 'var(--hairline)',
              background: 'var(--surface, #fff)',
              color: 'var(--ink-2)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="share-decision-submit"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="rounded-2xl px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
            style={{
              background: 'var(--rose, #f43f5e)',
              border: '1px solid var(--rose, #f43f5e)',
            }}
          >
            {share.isPending ? 'Sending…' : 'Send'}
          </button>
        </footer>
      </div>
    </Drawer>
  );
}
