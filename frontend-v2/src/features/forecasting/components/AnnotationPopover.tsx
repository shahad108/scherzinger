import { useEffect, useRef, useState } from 'react';
import type { AnnotationTarget, ForecastAnnotation } from '@/types/forecast';
import {
  useCreateAnnotation,
  useDeleteAnnotation,
  useForecastAnnotations,
} from '@/data/api/useForecastAnnotations';

interface Props {
  /** Anchor coordinates in viewport space (clientX/clientY). */
  anchor: { x: number; y: number };
  target: AnnotationTarget;
  onClose: () => void;
}

const MAX_BODY = 2000;

function targetLabel(t: AnnotationTarget): string {
  return t.kind === 'month' ? `Month ${t.value}` : `Cluster ${t.value}`;
}

/**
 * Phase H — lightweight annotation popover.
 *
 * Opens on right-click on a HeroForecast month or ClusterLens card. Shows all
 * saved annotations for the given target, lets the user add a new one, and
 * delete individual notes. Keyboard accessible: focus traps to the textarea on
 * open, ESC closes, the trigger surface also exposes a focus-visible "Add
 * note" button so right-click is never the only entry point.
 */
export function AnnotationPopover({ anchor, target, onClose }: Props) {
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useForecastAnnotations({ target });
  const createMut = useCreateAnnotation();
  const deleteMut = useDeleteAnnotation();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ESC + outside click → close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (e.target instanceof Node && popRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const items: ForecastAnnotation[] = data?.items ?? [];
  const trimmed = body.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= MAX_BODY && !createMut.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await createMut.mutateAsync({ target, body: trimmed });
      setBody('');
    } catch {
      // Mutation state surfaces the error in the footer.
    }
  };

  // Position the popover near the anchor but clamp inside the viewport so it
  // never spills offscreen. Width 320px.
  const W = 320;
  const PAD = 8;
  const left = Math.min(
    Math.max(PAD, anchor.x),
    typeof window !== 'undefined' ? window.innerWidth - W - PAD : anchor.x,
  );
  const top = Math.max(PAD, anchor.y + 4);

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-label={`Annotations — ${targetLabel(target)}`}
      data-testid="annotation-popover"
      style={{
        position: 'fixed',
        top,
        left,
        width: W,
        maxHeight: 'min(60vh, 480px)',
        overflow: 'auto',
        background: 'var(--surface, #fff)',
        border: '1px solid var(--hairline, #dde1e7)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-pop, 0 8px 24px rgba(0,0,0,0.12))',
        zIndex: 1000,
        padding: 12,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted, #7d8693)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Notes · {targetLabel(target)}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close annotations"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted, #7d8693)',
            fontSize: 14,
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>

      {isLoading && (
        <div style={{ fontSize: 11, color: 'var(--muted, #7d8693)', padding: '4px 0' }}>Loading…</div>
      )}

      {!isLoading && items.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted, #7d8693)', padding: '4px 0 8px' }}>
          No notes yet — add the first one below.
        </div>
      )}

      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((a) => (
            <li
              key={a.id}
              data-testid={`annotation-item-${a.id}`}
              style={{
                background: 'var(--surface-soft, #f7f7f8)',
                border: '1px solid var(--hairline, #dde1e7)',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--ink, #1f2329)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {a.body}
              </div>
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 10.5,
                  color: 'var(--muted, #7d8693)',
                }}
              >
                <span>
                  {a.author}
                  {' · '}
                  {new Date(a.createdAt).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(a.id)}
                  data-testid={`annotation-delete-${a.id}`}
                  disabled={deleteMut.isPending}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--hairline, #dde1e7)',
                    borderRadius: 5,
                    padding: '2px 7px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: 'var(--muted, #7d8693)',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="annotation-body" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted, #7d8693)', marginBottom: 4 }}>
        Add a note
      </label>
      <textarea
        id="annotation-body"
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={MAX_BODY}
        data-testid="annotation-body"
        placeholder="What changed? Why? (context for the next forecast cycle)"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          fontSize: 12,
          padding: '8px 10px',
          border: '1px solid var(--hairline, #dde1e7)',
          borderRadius: 8,
          resize: 'vertical',
          color: 'var(--ink, #1f2329)',
          background: 'var(--surface, #fff)',
        }}
      />
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10.5, color: 'var(--muted, #7d8693)' }}>
          {createMut.isError && 'Save failed — please retry.'}
          {!createMut.isError && `${trimmed.length}/${MAX_BODY}`}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--hairline, #dde1e7)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted, #7d8693)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="annotation-save"
            style={{
              background: canSave ? 'var(--rose-deep, #a04055)' : 'var(--surface-soft, #f7f7f8)',
              color: canSave ? '#fff' : 'var(--muted, #7d8693)',
              border: '1px solid ' + (canSave ? 'var(--rose-deep, #a04055)' : 'var(--hairline, #dde1e7)'),
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {createMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
