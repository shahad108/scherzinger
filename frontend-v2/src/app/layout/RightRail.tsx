import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Menu, NotebookPen, Plus } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useShell } from '@/data/api/useShell';
import type { NotifTone } from '@/types/shell';

const ToneIcon = ({ tone }: { tone: NotifTone }) => {
  if (tone === 'ok')   return <CheckCircle2 size={14} />;
  if (tone === 'warn') return <AlertTriangle size={14} />;
  return <Activity size={14} />;
};

export function RightRail() {
  const toggle = useUiStore((s) => s.toggleRightRail);
  const { data, isLoading } = useShell();

  if (isLoading || !data) return <aside className="pz-rail" aria-busy="true" />;

  return (
    <aside className="pz-rail">
      <button type="button" className="pz-shell-toggle" aria-label="Toggle right rail" onClick={toggle} style={{ left: 8, right: 'auto' }}>
        <Menu size={16} />
      </button>

      <div className="pz-rail-card">
        {data.notifications.map((n) => (
          <button type="button" key={n.id} className={`pz-notif${n.unread ? ' unread' : ''}`}>
            <span className={`pz-notif-ic ${n.tone}`}><ToneIcon tone={n.tone} /></span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <span className="pz-notif-title">{n.title}</span>
              <span className="pz-notif-sub" style={{ display: 'block' }}>{n.sub}</span>
            </span>
            <span className="pz-notif-arr" aria-hidden>
              <ArrowUpRight size={13} />
            </span>
          </button>
        ))}
        <div className="pz-notif-foot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" className="see">See all notifications →</button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
          >
            <NotebookPen size={12} /> Notes
          </button>
        </div>
      </div>

      <div className="pz-rail-card pad">
        <div className="pz-rail-h">
          <div>
            <h3>Assigned reviewers</h3>
            <div className="sub">{data.reviewers.panelLabel}</div>
          </div>
          <button type="button" aria-label="Open reviewers panel" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-2)' }}>
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="pz-avatars">
          {data.reviewers.people.map((p) => (
            <div key={p.id} className="a" style={{ background: p.bg }}>{p.initials}</div>
          ))}
          {data.reviewers.extraCount > 0 && <div className="a r">+{data.reviewers.extraCount}</div>}
        </div>
      </div>

      <div className="pz-rail-card pad">
        <div className="pz-rail-h">
          <h3>Sections</h3>
          <button type="button" aria-label="Add section" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
            <Plus size={11} /> Add
          </button>
        </div>
        <div className="pz-sec-list">
          {data.sections.map((s, i) => {
            const active = i === 0;
            return (
              <a
                key={s.id}
                className="pz-sec-row"
                href={s.href}
                style={
                  active
                    ? { background: '#e9dfd1', color: 'var(--ink)' }
                    : undefined
                }
              >
                <div>
                  <div className="t">{s.title}</div>
                  <div className="s">{s.sub}</div>
                </div>
                <span className="pz-sec-arr" aria-hidden style={active ? { color: 'var(--ink)' } : undefined}>→</span>
              </a>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
