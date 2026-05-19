// Pricing Studio v3 / Phase E (E1) — Evidence Tabs host.
//
// Consolidates the right-column evidence panels into a single tabbed
// surface so the recommendation hero stays on top and Frank can move
// between Cost · Quotes · Customers · Comparable · Lineage without
// scrolling past every panel.
//
// Contract:
//   - Tab state is driven by `?tab=<key>` in the URL. Default is `cost`.
//     Updating the active tab pushes the query param so the back-button
//     returns to the previous tab.
//   - Each tab is disabled (lock icon + tooltip) when its block status is
//     not `"live"`. Disabled tabs cannot be activated via click or
//     keyboard.
//   - Keyboard: ArrowLeft / ArrowRight cycle between *enabled* tabs and
//     skip disabled ones. Home / End jump to first / last enabled.
//     Enter / Space activate the focused tab.
//   - ARIA: role="tablist" + role="tab" + aria-selected + aria-controls,
//     matching the WAI-ARIA Authoring Practices tab pattern.

import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export type EvidenceTabKey =
  | 'cost'
  | 'quotes'
  | 'customers'
  | 'comparable'
  | 'lineage';

export type EvidenceTabStatus = 'live' | 'empty' | 'degraded' | 'locked';

export interface EvidenceTabsProps {
  tabStatus: Record<EvidenceTabKey, EvidenceTabStatus>;
  panes: Record<EvidenceTabKey, ReactNode>;
  defaultTab?: EvidenceTabKey;
}

interface TabDef {
  key: EvidenceTabKey;
  label: string;
}

const TAB_DEFS: TabDef[] = [
  { key: 'cost', label: 'Cost' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'customers', label: 'Customers' },
  { key: 'comparable', label: 'Comparable' },
  { key: 'lineage', label: 'Lineage' },
];

const VALID_KEYS = new Set<EvidenceTabKey>(TAB_DEFS.map((t) => t.key));

function isTabKey(value: string | null | undefined): value is EvidenceTabKey {
  return Boolean(value && VALID_KEYS.has(value as EvidenceTabKey));
}

/**
 * Returns the "best" tab to land on given the URL param + the per-tab
 * status map. We honour `?tab=` when it's valid AND enabled; otherwise
 * fall back to the explicit defaultTab, then to the first enabled tab,
 * and finally — if everything is locked — to "cost" (the most common
 * surface so the page never has nothing selected).
 */
function resolveActive(
  urlTab: string | null | undefined,
  fallback: EvidenceTabKey,
  tabStatus: Record<EvidenceTabKey, EvidenceTabStatus>,
): EvidenceTabKey {
  if (isTabKey(urlTab) && tabStatus[urlTab] === 'live') return urlTab;
  if (isTabKey(urlTab)) return urlTab; // keep selection visible even if disabled
  if (tabStatus[fallback] === 'live') return fallback;
  const firstLive = TAB_DEFS.find((t) => tabStatus[t.key] === 'live');
  if (firstLive) return firstLive.key;
  return fallback;
}

// Tiny lock glyph reused on disabled tabs. Inline so we don't pull a new
// icon dep just for this component.
function LockGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-1px' }}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function EvidenceTabs({
  tabStatus,
  panes,
  defaultTab = 'cost',
}: EvidenceTabsProps) {
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const activeKey = useMemo(
    () => resolveActive(urlTab, defaultTab, tabStatus),
    [urlTab, defaultTab, tabStatus],
  );

  // Set the URL on first mount only when no `?tab=` is present, so the
  // browser back-button can return to "no tab selected". We intentionally
  // do NOT mirror every internal resolveActive() decision back to the URL
  // so the URL keeps representing user intent, not derived state.
  // (defaultTab is also persisted by the parent context when needed.)

  const tabRefs = useRef<Partial<Record<EvidenceTabKey, HTMLButtonElement | null>>>({});

  const enabledKeys = useMemo(
    () => TAB_DEFS.filter((t) => tabStatus[t.key] === 'live').map((t) => t.key),
    [tabStatus],
  );

  const activate = useCallback(
    (key: EvidenceTabKey) => {
      if (tabStatus[key] !== 'live') return;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', key);
          return next;
        },
        // NOT { replace: true } — we want the back-button to undo tab
        // switches per E1 contract.
      );
    },
    [setParams, tabStatus],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, key: EvidenceTabKey) => {
      const enabled = enabledKeys;
      if (enabled.length === 0) return;
      const currentIdx = enabled.indexOf(key);
      const baseIdx = currentIdx === -1 ? 0 : currentIdx;
      let nextKey: EvidenceTabKey | null = null;
      if (e.key === 'ArrowRight') {
        nextKey = enabled[(baseIdx + 1) % enabled.length];
      } else if (e.key === 'ArrowLeft') {
        nextKey = enabled[(baseIdx - 1 + enabled.length) % enabled.length];
      } else if (e.key === 'Home') {
        nextKey = enabled[0];
      } else if (e.key === 'End') {
        nextKey = enabled[enabled.length - 1];
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (tabStatus[key] === 'live') {
          e.preventDefault();
          activate(key);
        }
        return;
      } else {
        return;
      }
      e.preventDefault();
      if (nextKey) {
        activate(nextKey);
        tabRefs.current[nextKey]?.focus();
      }
    },
    [enabledKeys, activate, tabStatus],
  );

  // Focus management: when the URL flips a tab (deep-link or click) we
  // let the natural `tabIndex={active ? 0 : -1}` carry focus on the next
  // user interaction; we don't steal focus on mount.

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{
        borderColor: 'var(--hairline)',
        boxShadow: 'var(--shadow-card, 0 1px 2px rgba(0,0,0,0.04))',
      }}
      data-testid="evidence-tabs"
    >
      <div
        role="tablist"
        aria-label="Evidence"
        className="mb-3 inline-flex flex-wrap gap-0.5 rounded-[10px] p-[3px]"
        style={{ background: 'var(--surface-sunken)' }}
      >
        {TAB_DEFS.map((t) => {
          const status = tabStatus[t.key];
          const disabled = status !== 'live';
          const active = t.key === activeKey;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              type="button"
              role="tab"
              id={`evidence-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`evidence-tabpanel-${t.key}`}
              aria-disabled={disabled || undefined}
              data-status={status}
              data-testid={`evidence-tab-${t.key}`}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              title={disabled ? 'Not enough data' : undefined}
              onClick={() => activate(t.key)}
              onKeyDown={(e) => handleKeyDown(e, t.key)}
              className={[
                'flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12.5px] transition-all focus-visible:outline-none focus-visible:ring-2',
                active
                  ? 'bg-white font-semibold shadow-[var(--shadow-card)]'
                  : 'font-medium hover:text-[var(--ink-2)]',
                disabled ? 'cursor-not-allowed opacity-55' : '',
              ].join(' ')}
              style={{
                color: active ? 'var(--ink)' : 'var(--ink-3)',
              }}
            >
              {disabled && <LockGlyph />}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {TAB_DEFS.map((t) => {
        const active = t.key === activeKey;
        if (!active) return null;
        return (
          <div
            key={t.key}
            role="tabpanel"
            id={`evidence-tabpanel-${t.key}`}
            aria-labelledby={`evidence-tab-${t.key}`}
            data-testid={`evidence-tabpanel-${t.key}`}
          >
            {panes[t.key]}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Quiet placeholder reused for "coming next pass" panes (Quotes E3 and
 * Lineage E6). Matches the dashed-empty pattern used elsewhere in the
 * pricing-studio surface (see ComparablePanelGate in pricing-studio
 * index.tsx).
 */
export function EvidencePanePlaceholder({ copy }: { copy: string }) {
  return (
    <div
      role="note"
      data-testid="evidence-pane-placeholder"
      style={{
        margin: '4px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-sunken)',
        border: '1px dashed var(--hairline)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      {copy}
    </div>
  );
}
