import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { postJson } from '@/lib/api/client';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
import type { NewProductForecast as NewProductForecastData } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

const CANDIDATE_CLUSTERS: Record<string, { id: string; similarityScore: number; sampleSize: number; rationale: string }[]> = {
  BKAES: [
    { id: 'BKAES', similarityScore: 0.92, sampleSize: 627, rationale: 'Shares commodity_group BKAES + same business_unit; BOM signature overlap 86%.' },
    { id: 'BKAGG', similarityScore: 0.61, sampleSize: 370, rationale: 'Similar bearing/shaft assembly cohort.' },
    { id: 'BKAIZ', similarityScore: 0.34, sampleSize: 142, rationale: 'Adjacent coupling family; weaker match.' },
  ],
  BKAGG: [
    { id: 'BKAGG', similarityScore: 0.94, sampleSize: 370, rationale: 'Direct cluster match; n adequate.' },
    { id: 'BKAES', similarityScore: 0.58, sampleSize: 627, rationale: 'Larger neighbour cohort; useful prior.' },
    { id: 'BKAIZ', similarityScore: 0.41, sampleSize: 142, rationale: 'Adjacent coupling family.' },
  ],
  SOPU: [
    { id: 'SOPU', similarityScore: 0.79, sampleSize: 6, rationale: 'Direct match but very low n; defer to manual review.' },
    { id: 'BKAIZ', similarityScore: 0.46, sampleSize: 142, rationale: 'Specialty coupling adjacency.' },
    { id: 'BKAGG', similarityScore: 0.32, sampleSize: 370, rationale: 'Closest stable-n alternative.' },
  ],
};

interface Props {
  data: NewProductForecastData;
}

function renderBoldDescription(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <b key={i} style={{ color: 'var(--ink)', fontWeight: 700 }}>
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function NewProductForecast({ data }: Props) {
  const { stats, series, cards } = data;

  return (
    <>
      <div className="section-row">
        <div>
          <h2>New product forecast · comparable cluster</h2>
          <div className="sub">
            Frank's job: price new products without a historical baseline. Model assigns each new
            SKU to its closest cluster.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AccuracyBadge
            data={{
              metric: 'mape',
              value: 0.0688,
              n: 36,
              horizonMonths: 12,
              modelId: 'margin_walk_forward_v3',
            }}
            entityType="product"
            drawerTitle="New-product cluster anchor — lineage"
          />
          <span className="tag-chip">Predictive Portfolio Pricing</span>
        </div>
      </div>

      <div className="lq-card">
        <div className="lq-stats">
          {stats.map((s) => (
            <div className="lq-stat" key={s.label}>
              <div className="num">{s.num}</div>
              <div className="lab">{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 160, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="newProductGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5a7da3" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#5a7da3" stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                stroke="#7d8693"
                tick={{ fontSize: 11, fill: '#7d8693' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: '#c8cdd4', strokeDasharray: '3 3' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 11,
                  fontSize: 12,
                  boxShadow: 'var(--shadow-pop)',
                }}
                formatter={(v) => [typeof v === 'number' ? `${v} SKUs` : String(v ?? ''), 'New SKUs']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#5a7da3"
                strokeWidth={2}
                fill="url(#newProductGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="actions-list" style={{ marginTop: 14 }}>
        {cards.map((c) => (
          <NewProductCardWithPicker key={c.rank} card={c} renderBoldDescription={renderBoldDescription} />
        ))}
      </div>
    </>
  );
}

interface NewProductCardProps {
  card: NewProductForecastData['cards'][number];
  renderBoldDescription: (text: string) => React.ReactNode;
}

function NewProductCardWithPicker({ card, renderBoldDescription }: NewProductCardProps) {
  const candidates = CANDIDATE_CLUSTERS[card.cluster] ?? [];
  const [selected, setSelected] = useState(candidates[0]?.id ?? card.cluster);
  const [busy, setBusy] = useState(false);
  const [showAvg, setShowAvg] = useState<string | null>(null);
  const [confirmAssign, setConfirmAssign] = useState<string | null>(null);
  const toast = useActionFeedbackStore((s) => s.pushToast);
  const toneCls = card.tone === 'status' ? 'status' : `status ${card.tone}`;
  const isManual = card.primaryAction === 'manual';
  const active = candidates.find((c) => c.id === selected) ?? candidates[0];

  // Card titles begin with the article id (e.g. "218812-K · Sleeve variant").
  // Pull the first token so the POST payloads carry a real id.
  const articleId = card.title.split(/\s|·/)[0] ?? card.title;

  const postAssign = async (clusterId: string) => {
    setBusy(true);
    try {
      await postJson('/forecast/new-product/assign-cluster', {
        article_id: articleId,
        cluster_id: clusterId,
      });
      toast(`Cluster set to ${clusterId} for ${articleId}`, 'info');
      setSelected(clusterId);
    } catch (err) {
      toast(`Assign failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const postManualReview = async () => {
    setBusy(true);
    try {
      await postJson('/forecast/new-product/manual-review', {
        article_id: articleId,
        cluster_id: selected,
      });
      toast(`Manual review queued for ${articleId}`, 'info');
    } catch (err) {
      toast(`Manual review failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="action-card">
      <div className="ac-section">
        <div className="ac-head">
          <div className="ac-rank">{card.rank}</div>
          <div className="ac-title">
            <div className="h">{card.title}</div>
            <div className="t">{renderBoldDescription(card.description)}</div>
          </div>
          <div className="ac-tools">
            <span className={`tag-chip ${toneCls}`}>{card.confidence}</span>
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="mt-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3" data-testid={`cluster-picker-${card.rank}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Assigned cluster
              </span>
              <select
                data-testid={`cluster-picker-select-${card.rank}`}
                value={selected}
                disabled={busy}
                onChange={(e) => postAssign(e.target.value)}
                className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)] disabled:opacity-60"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · similarity {(c.similarityScore * 100).toFixed(0)}% · n={c.sampleSize}
                  </option>
                ))}
              </select>
            </div>
            {active && (
              <div className="mt-1 text-[11.5px] italic text-[var(--muted)]" title="Why this cluster?">
                {active.rationale}
              </div>
            )}
          </div>
        )}

        <div className="ac-cta-row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn-secondary"
            data-testid={`np-secondary-${card.rank}`}
            onClick={() => setShowAvg(selected)}
          >
            {card.secondaryLabel}
          </button>
          {isManual ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              data-testid={`np-primary-${card.rank}`}
              onClick={postManualReview}
            >
              {card.primaryLabel}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary-rose"
              disabled={busy}
              data-testid={`np-primary-${card.rank}`}
              onClick={() => setConfirmAssign(selected)}
            >
              {card.primaryLabel}
            </button>
          )}
        </div>
      </div>

      {showAvg && (
        <ClusterAverageDrawer
          clusterId={showAvg}
          articleId={articleId}
          onClose={() => setShowAvg(null)}
        />
      )}
      {confirmAssign && (
        <ConfirmAssignModal
          clusterId={confirmAssign}
          articleId={articleId}
          onCancel={() => setConfirmAssign(null)}
          onConfirm={async () => {
            await postAssign(confirmAssign);
            setConfirmAssign(null);
          }}
          busy={busy}
        />
      )}
    </div>
  );
}

interface AvgDrawerProps {
  clusterId: string;
  articleId: string;
  onClose: () => void;
}

function ClusterAverageDrawer({ clusterId, articleId, onClose }: AvgDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" data-testid="cluster-average-drawer">
      <button type="button" aria-label="Dismiss" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="relative ml-auto h-full w-full max-w-[420px] overflow-y-auto bg-white shadow-2xl border-l-4 border-[var(--rose-deep)]">
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Cluster average
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              {clusterId} · anchor for {articleId}
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]">
            <X size={16} />
          </button>
        </header>
        <div className="p-5 text-[12.5px] text-[var(--ink-2)] space-y-3">
          <div>Cluster {clusterId} acts as the price/margin/volume anchor for this new SKU.</div>
          <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[11.5px] text-[var(--muted)]">
            Real cluster averages will populate from
            <code className="mx-1">/forecast/new-product/cluster-average?cluster_id={clusterId}</code>
            when the endpoint ships.
          </div>
        </div>
      </aside>
    </div>
  );
}

interface ConfirmAssignProps {
  clusterId: string;
  articleId: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
}

function ConfirmAssignModal({ clusterId, articleId, onCancel, onConfirm, busy }: ConfirmAssignProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" role="dialog" aria-modal="true" data-testid="confirm-assign-modal">
      <div className="w-full max-w-[420px] rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-2xl">
        <h3 className="font-display text-[16px] font-bold text-[var(--ink)]">Assign {articleId} to cluster {clusterId}?</h3>
        <p className="mt-2 text-[12.5px] text-[var(--ink-2)]">
          The forecast for this new SKU will use the {clusterId} cluster as its prior. You can change this later.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary-rose" onClick={() => onConfirm()} disabled={busy}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
