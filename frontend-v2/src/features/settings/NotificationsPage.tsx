// Phase 14 P14.T5 — full notifications list (paginated).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { useMarkNotificationRead } from '@/data/api/useShellMutations';

interface NotificationRow {
  id: string;
  tone: 'ok' | 'warn' | 'info';
  title: string;
  sub: string;
  unread: boolean;
  created_at: string;
}

interface NotificationsResponse {
  notifications: NotificationRow[];
  next_cursor: string | null;
}

function ToneIcon({ tone }: { tone: NotificationRow['tone'] }) {
  if (tone === 'ok') return <CheckCircle2 size={14} className="text-[var(--green)]" />;
  if (tone === 'warn') return <AlertTriangle size={14} className="text-[var(--amber)]" />;
  return <Activity size={14} className="text-[var(--violet)]" />;
}

export default function NotificationsPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'page', cursor ?? 'first'],
    queryFn: () =>
      apiFetch<NotificationsResponse>('/notifications', {
        params: { limit: 50, cursor },
      }),
    staleTime: 30_000,
  });
  const markRead = useMarkNotificationRead();

  if (isLoading) return <div className="text-[13px] text-[var(--muted)]">Loading…</div>;

  const items = data?.notifications ?? [];

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[14px] font-bold text-[var(--ink)]">All notifications</h2>
      {items.length === 0 ? (
        <div className="text-[13px] text-[var(--muted)]">No notifications.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 rounded-[10px] border bg-white p-3 ${
                n.unread ? 'border-[var(--rose)]' : 'border-[var(--border)]'
              }`}
            >
              <ToneIcon tone={n.tone} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[var(--ink)]">{n.title}</div>
                <div className="text-[12px] text-[var(--muted)]">{n.sub}</div>
                <div className="mt-1 text-[11px] text-[var(--muted-2)]">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              {n.unread && (
                <button
                  type="button"
                  className="rounded-[8px] border border-[var(--border)] bg-white px-2 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]"
                  onClick={() => markRead.mutate(n.id)}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data?.next_cursor && (
        <button
          type="button"
          onClick={() => setCursor(data.next_cursor ?? undefined)}
          className="self-start rounded-[10px] border border-[var(--border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--ink-2)]"
        >
          Load more
        </button>
      )}
    </div>
  );
}
