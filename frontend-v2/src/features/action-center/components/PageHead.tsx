import { Bookmark, ChevronDown, Download, Filter, Layers } from 'lucide-react';
import type { ActionCenterHeader } from '@/types';
import type { ActionIntent } from '@/types/uiActions';

interface Props {
  header: ActionCenterHeader;
  breadcrumbLabel: string;
  greeting: string;
  hideLocked?: boolean;
  onToggleHideLocked?: (next: boolean) => void;
  showAll?: boolean;
  onToggleShowAll?: (next: boolean) => void;
  onAction?: (intent: ActionIntent) => void;
  reportReady?: boolean;
  exportDisabledReason?: string;
  /** Reserved for the Phase 2 export-context drawer (plan §4 / §2.1 F2).
   *  Today the items list comes straight from ``header.exportContext``;
   *  this prop stays on the interface so callers don't churn when the
   *  drawer regains a trace-id row. */
  traceId?: string;
}

export function PageHead({
  header,
  breadcrumbLabel,
  greeting,
  hideLocked = false,
  onToggleHideLocked,
  showAll = false,
  onToggleShowAll,
  onAction,
  reportReady = false,
  exportDisabledReason,
}: Props) {
  return (
    <>
      <div className="mb-3 text-xs text-[var(--muted)]" data-testid="ac-breadcrumb">
        <span>Cockpit</span>
        <span className="mx-1.5 text-[var(--muted-2)]">/</span>
        <span>{breadcrumbLabel}</span>
        <span className="mx-1.5 text-[var(--muted-2)]">/</span>
        <b className="font-semibold text-[var(--ink-2)]">Action Center</b>
      </div>

      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-x-3.5 gap-y-6">
        <div className="min-w-0 flex-1 basis-[360px]">
          <h1
            data-testid="ac-greeting"
            className="font-display text-[34px] font-bold leading-[1.1] tracking-[-0.028em] text-[var(--ink)]"
          >
            {greeting}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--muted)]">
            <span
              data-testid="ac-week-chip"
              className="text-[11.5px]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '5px 10px',
                letterSpacing: '0.01em',
              }}
            >
              <b className="font-semibold text-[var(--ink-2)]">{header.week}</b> · {header.dateRange}
            </span>
            {header.stats.map((s) => (
              <span
                key={s.label}
                className="text-[11.5px]"
                style={{
                  background: 'var(--surface-soft)',
                  borderRadius: 7,
                  padding: '5px 10px',
                }}
              >
                <b className="font-bold text-[var(--ink-2)]">{s.value}</b> {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          {onToggleHideLocked && (
            <button
              type="button"
              onClick={() => onToggleHideLocked(!hideLocked)}
              aria-pressed={hideLocked}
              className="inline-flex items-center gap-2 text-[12.5px] font-medium transition-colors hover:bg-[#f7f9fb]"
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 11,
                background: hideLocked ? 'var(--surface-soft)' : 'var(--surface)',
                border: hideLocked ? '1px solid var(--ink-3)' : '1px solid var(--border)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              <Filter size={13} className="text-[var(--ink-3)]" />
              {hideLocked ? 'Locked hidden' : 'Hide locked'}
            </button>
          )}
          {onToggleShowAll && (
            <button
              type="button"
              onClick={() => onToggleShowAll(!showAll)}
              aria-pressed={showAll}
              title="Expand every list block (decisions, SKU table, rejections, …) to show all rows"
              className="inline-flex items-center gap-2 text-[12.5px] font-medium transition-colors hover:bg-[#f7f9fb]"
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 11,
                background: showAll ? 'var(--rose)' : 'var(--surface)',
                border: showAll ? '1px solid var(--rose)' : '1px solid var(--border)',
                color: showAll ? '#fff' : 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              <Layers size={13} className={showAll ? 'text-white' : 'text-[var(--ink-3)]'} />
              {showAll ? 'Showing all' : 'Show all'}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onAction?.({
                drawer: {
                  title: 'Save current view',
                  description: 'Persist the active filters so you can return to this lens later.',
                  formKind: 'saved_view_save',
                  context: {
                    screen: 'action-center',
                    filters: {
                      hide_locked: hideLocked,
                      show_all: showAll,
                    },
                  },
                },
              })
            }
            className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[#f7f9fb]"
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 11,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <Bookmark size={13} className="text-[var(--ink-3)]" /> Save view
          </button>
          {[
            {
              icon: ChevronDown,
              label: 'Workspace scope',
              // Items come from ``header.workspaceScope`` (plan §4 / §2.1 F2).
              // The backend returns an empty array today; that empty drawer
              // is the honest pre-Phase-2 state — never invent items here.
              action: {
                drawer: {
                  title: 'Workspace scope',
                  description: 'This Action Center is operating inside the authenticated pricing workspace.',
                  items: header.workspaceScope ?? [],
                  emptyLabel:
                    'Workspace scope items will populate once user_view_state is wired in Phase 2.',
                },
              } satisfies ActionIntent,
            },
            {
              icon: Download,
              label: 'Export',
              // Items come from ``header.exportContext`` (plan §4 / §2.1 F2).
              // When the report is not ready the button stays disabled via
              // ``disabledReason``; when it is ready we open the drawer with
              // whatever the backend exposed (today: empty array).
              action: reportReady
                ? ({
                    drawer: {
                      title: 'Report export',
                      description: 'Exports are available through the report workflow on this screen.',
                      items: header.exportContext ?? [],
                      emptyLabel:
                        'Export options will populate once the report registry lands in Phase 2.',
                    },
                  } satisfies ActionIntent)
                : ({
                    disabledReason:
                      exportDisabledReason ?? 'Report export is unavailable until the report pipeline is live for this workspace.',
                  } satisfies ActionIntent),
            },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              onClick={() => onAction?.(action)}
              className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[#f7f9fb]"
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 11,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <Icon size={13} className="text-[var(--ink-3)]" /> {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
