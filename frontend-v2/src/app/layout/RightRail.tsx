import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Menu, NotebookPen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '@/stores/uiStore';
import { useShell } from '@/data/api/useShell';
import { useMarkNotificationRead } from '@/data/api/useShellMutations';
import { useUiAction } from '@/hooks/useUiAction';
import { apiFetch } from '@/lib/api/client';
import type { NotifTone, ShellNotification } from '@/types/shell';

const ToneIcon = ({ tone }: { tone: NotifTone }) => {
  if (tone === 'ok')   return <CheckCircle2 size={14} />;
  if (tone === 'warn') return <AlertTriangle size={14} />;
  return <Activity size={14} />;
};

interface NotificationsApiResponse {
  notifications: { id: string; tone: NotifTone; title: string; sub: string; unread: boolean; created_at?: string }[];
  next_cursor: string | null;
}

export function RightRail() {
  const toggle = useUiStore((s) => s.toggleRightRail);
  const { data, isLoading } = useShell();
  const markRead = useMarkNotificationRead();
  const runAction = useUiAction();
  const { t } = useTranslation();

  // Phase 4.5 audit fix: source notifications from the real /notifications
  // endpoint instead of the hardcoded shell.json (which seeded fake "PRO mode
  // activated", "New SKU recommendation 205418-A", "Phase deadline soon").
  // Falls back to empty state on failure so we never show seed noise.
  const { data: notifData, isLoading: notifLoading, isError: notifError } = useQuery({
    queryKey: ['notifications', 'rail'],
    queryFn: () => apiFetch<NotificationsApiResponse>('/notifications', { params: { limit: 5 } }),
    staleTime: 30_000,
    retry: 0,
  });
  const liveNotifs: ShellNotification[] = (notifData?.notifications ?? []).map((n) => ({
    id: n.id,
    tone: n.tone,
    title: n.title,
    sub: n.sub,
    unread: n.unread,
  }));

  if (isLoading || !data) return <aside className="pz-rail" aria-busy="true" />;

  return (
    <aside className="pz-rail">
      <button type="button" className="pz-shell-toggle" aria-label="Toggle right rail" onClick={toggle} style={{ left: 8, right: 'auto' }}>
        <Menu size={16} />
      </button>

      <div className="pz-rail-card notif-card">
        {notifLoading ? (
          <div className="pz-notif" aria-busy="true" style={{ opacity: 0.6 }}>
            <span className="pz-notif-ic info"><Activity size={14} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="pz-notif-title" style={{ display: 'block' }}>Loading notifications…</span>
            </span>
          </div>
        ) : liveNotifs.length === 0 ? (
          <div
            className="pz-notif"
            data-testid="rail-notifs-empty"
            style={{ cursor: 'default', color: 'var(--muted)' }}
          >
            <span className="pz-notif-ic info"><CheckCircle2 size={14} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="pz-notif-title" style={{ display: 'block' }}>
                {notifError ? 'Notifications unavailable' : 'No new notifications'}
              </span>
              <span className="pz-notif-sub" style={{ display: 'block' }}>
                {notifError ? 'We could not reach the notifications service.' : 'You are all caught up.'}
              </span>
            </span>
          </div>
        ) : (
          liveNotifs.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`pz-notif${n.unread ? ' unread' : ''}`}
              onClick={() => {
                if (n.unread) markRead.mutate(n.id);
                runAction({
                  route: '/notifications',
                  query: { notification: n.id },
                  toast: n.unread ? `${n.title} marked read.` : `Opening ${n.title}.`,
                });
              }}
            >
              <span className={`pz-notif-ic ${n.tone}`}><ToneIcon tone={n.tone} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="pz-notif-title" style={{ display: 'block' }}>{n.title}</span>
                <span className="pz-notif-sub" style={{ display: 'block' }}>{n.sub}</span>
              </span>
              <span className="pz-notif-arr" aria-hidden>
                <ArrowUpRight size={13} />
              </span>
            </button>
          ))
        )}
        <div className="pz-notif-foot">
          <Link to="/notifications" className="see" style={{ textDecoration: 'none' }}>
            {t('rail.seeAll')} <ArrowUpRight size={13} />
          </Link>
          <Link to="/notes" className="notes" style={{ textDecoration: 'none' }}>
            <NotebookPen size={13} /> {t('rail.notes')}
          </Link>
        </div>
      </div>

      <div className="pz-rail-card pad">
        <div className="pz-rail-h">
          <div>
            <h3>{t('rail.reviewers')}</h3>
            <div className="sub">{data.reviewers.panelLabel}</div>
          </div>
          <button
            type="button"
            aria-label="Add reviewer"
            onClick={() =>
              runAction({
                drawer: {
                  title: 'Add reviewer',
                  description: `Append a reviewer to "${data.reviewers.panelLabel}".`,
                  formKind: 'add_reviewer',
                  context: {
                    panelId: data.reviewers.panelId,
                    panelLabel: data.reviewers.panelLabel,
                  },
                },
              })
            }
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-2)' }}
            title={
              data.reviewers.panelId
                ? 'Add reviewer to this panel'
                : 'Reviewer panel not configured yet'
            }
          >
            {data.reviewers.panelId ? <Plus size={14} /> : <ArrowUpRight size={14} />}
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
          <h3>{t('rail.sections')}</h3>
          <button
            type="button"
            aria-label={t('rail.addSection')}
            className="pz-add-section"
            onClick={() =>
              runAction({
                drawer: {
                  title: t('rail.addSection'),
                  description: 'Pin a quick-access shortcut to the right rail.',
                  formKind: 'add_section',
                  context: {},
                },
              })
            }
          >
            <Plus size={11} /> {t('rail.add')}
          </button>
        </div>
        <div className="pz-sec-list">
          {data.sections.map((s, i) => {
            const active = i === 0;
            return (
              <a key={s.id} className={active ? 'pz-sec-row active' : 'pz-sec-row'} href={s.href}>
                <div className="min-w-0 flex-1">
                  <div className="t">{s.title}</div>
                  <div className="s">{s.sub}</div>
                </div>
                <span className="pz-sec-arr" aria-hidden>→</span>
              </a>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
