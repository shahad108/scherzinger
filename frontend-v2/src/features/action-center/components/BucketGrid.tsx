import { ArrowRight } from 'lucide-react';
import type { BucketCard } from '@/types';
import { EmptyBlock } from './EmptyBlock';

export function BucketGrid({ buckets }: { buckets: BucketCard[] }) {
  if (!buckets || buckets.length === 0) {
    return <EmptyBlock title="Buckets" hint="No buckets to show for the active filter." />;
  }
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      {buckets.map((b) => (
        <div
          key={b.id}
          className="flex flex-col gap-3 rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
          style={{ padding: '18px 20px 16px' }}
        >
          <div>
            <h3 className="font-display text-[19px] font-bold leading-tight tracking-[-0.014em] text-[var(--ink)]">
              {b.title}
            </h3>
            <div className="mt-1 text-[12.5px] text-[var(--muted)]">{b.subtitle}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {b.tags.map((t) => {
              const isStatus = t.tone === 'info' || t.tone === 'warning';
              const dotColor =
                t.tone === 'warning' ? 'var(--amber)' :
                t.tone === 'info'    ? 'var(--green)' :
                null;
              return (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] text-[11.5px] font-medium text-[var(--ink-2)]"
                  style={{ background: 'var(--surface-sunken)', padding: '5px 9px' }}
                >
                  {isStatus && dotColor && (
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: dotColor }}
                    />
                  )}
                  {t.label}
                </span>
              );
            })}
          </div>
          <div className="mt-auto flex items-center justify-between">
            <div className="flex items-center">
              {b.avatars.map((a, i) => {
                const isExtra = a.startsWith('+');
                return (
                  <div
                    key={a + i}
                    className="grid h-[30px] w-[30px] place-items-center rounded-full text-[11px]"
                    style={{
                      background: isExtra ? 'var(--rose)' : 'var(--surface-sunken)',
                      color: isExtra ? '#fff' : 'var(--ink-2)',
                      border: '2.5px solid #fff',
                      marginLeft: i === 0 ? 0 : '-9px',
                      fontWeight: isExtra ? 700 : 600,
                      zIndex: isExtra ? 2 : 1,
                      boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
                    }}
                  >
                    {a}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="inline-flex items-center text-[12.5px] font-medium text-white transition-colors"
              style={{
                background: '#101418',
                height: 36,
                padding: '0 16px',
                borderRadius: 11,
                gap: 12,
                boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
                border: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#252a33')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#101418')}
            >
              {b.cta}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
