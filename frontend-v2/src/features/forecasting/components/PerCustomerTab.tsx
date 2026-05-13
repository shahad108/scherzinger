// Phase 4 — "Top customers at decline risk" + drilled-in detail.
// Used as a tab on /forecasting (via routing in features/forecasting/index.tsx).

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useForecastCustomers, useForecastCustomerDetail } from '@/data/api/useForecastCustomers';
import type { CustomerAtRiskRow } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { RiskTierChip } from './RiskTierChip';

const RISK_FILTERS = ['high', 'medium', 'low', 'all'] as const;

export function PerCustomerTab() {
  const [riskFilter, setRiskFilter] =
    useState<(typeof RISK_FILTERS)[number]>('high');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useForecastCustomers({ risk_filter: riskFilter });

  return (
    <section className="mt-4" data-testid="per-customer-tab">
      <div className="section-row">
        <div>
          <h2>Customers at decline risk</h2>
          <div className="sub">
            Joint risk = max(P(churn 4Q), P(major decline)). Click a row to drill into the
            distributions + history.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AccuracyBadge
            data={{ metric: 'auc_roc', value: 0.93, n: 482, horizonMonths: 12 }}
            entityType="customer"
            drawerTitle="Customer churn classifier — lineage"
          />
          <div role="tablist" aria-label="Risk filter" className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
            {RISK_FILTERS.map((rf) => {
              const isActive = rf === riskFilter;
              return (
                <button
                  key={rf}
                  type="button"
                  data-testid={`risk-filter-${rf}`}
                  aria-selected={isActive}
                  onClick={() => setRiskFilter(rf)}
                  className={
                    isActive
                      ? 'rounded-full bg-[var(--rose-bg)] px-3 py-1 text-[11.5px] font-semibold text-[var(--rose-deep)]'
                      : 'rounded-full px-3 py-1 text-[11.5px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-soft)]'
                  }
                >
                  {rf}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lq-card">
        {isLoading && <div className="p-4 text-[12.5px] text-[var(--muted)]">Loading…</div>}
        {data && (
          <table className="w-full text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-right">LTM revenue</th>
                <th className="px-3 py-2 text-right">12mo median</th>
                <th className="px-3 py-2 text-right">P5</th>
                <th className="px-3 py-2 text-right">P(decline)</th>
                <th className="px-3 py-2 text-left">Risk</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.topAtRisk.map((row) => (
                <tr
                  key={row.customerId}
                  data-testid={`customer-row-${row.customerId}`}
                  className="border-t border-[var(--hairline)] hover:bg-[var(--surface-soft)]"
                >
                  <td className="px-3 py-2">
                    <div className="font-semibold text-[var(--ink)]">{row.customerId}</div>
                    <div className="text-[11px] text-[var(--muted)]">{row.customerName}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">€{fmt(row.lastActualRevenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">€{fmt(row.median12moRevenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">€{fmt(row.p5Revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.pBelow80pctOfCurrent != null
                      ? `${row.pBelow80pctOfCurrent.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <RiskTierChip
                      tier={row.riskTier}
                      pChurn={row.pChurn4Q}
                      pDecline={row.pMajorDecline}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      data-testid={`open-customer-${row.customerId}`}
                      onClick={() => setSelectedId(row.customerId)}
                      className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--ink-2)] hover:border-[var(--rose-deep)] hover:text-[var(--rose-deep)]"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {data.topAtRisk.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-[var(--muted)]">
                    No customers match the {riskFilter} filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <CustomerForecastDetail
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          previewRow={
            data?.topAtRisk.find((c) => c.customerId === selectedId)
          }
        />
      )}
    </section>
  );
}

function fmt(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

interface DetailProps {
  customerId: string;
  onClose: () => void;
  previewRow?: CustomerAtRiskRow;
}

function CustomerForecastDetail({ customerId, onClose, previewRow }: DetailProps) {
  const { data } = useForecastCustomerDetail(customerId);
  const distributions = data?.distributions ?? {};
  const history = data?.historicalRevenue ?? [];
  const navigate = useNavigate();

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      data-testid="customer-detail"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative ml-auto h-full w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Customer detail
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              {data?.customerName ?? `Customer ${customerId}`}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
          >
            ×
          </button>
        </header>

        <div className="p-5 space-y-5">
          {previewRow && (
            <section className="flex flex-wrap items-center gap-2">
              <RiskTierChip
                tier={previewRow.riskTier}
                pChurn={previewRow.pChurn4Q}
                pDecline={previewRow.pMajorDecline}
              />
              <span className="tag-chip">
                P(churn 4Q): {previewRow.pChurn4Q != null
                  ? `${(previewRow.pChurn4Q * 100).toFixed(0)}%`
                  : '—'}
              </span>
              <span className="tag-chip">
                P(major decline):{' '}
                {previewRow.pMajorDecline != null
                  ? `${(previewRow.pMajorDecline * 100).toFixed(0)}%`
                  : '—'}
              </span>
            </section>
          )}

          <Section title="Revenue · 12mo">
            <DistRow d={distributions.revenue?.['12']} unit="€" />
          </Section>
          <Section title="Margin · 12mo">
            <DistRow d={distributions.margin?.['12']} unit="%" />
          </Section>
          <Section title="Quantity · 12mo">
            <DistRow d={distributions.quantity?.['12']} unit="" />
          </Section>

          <Section title="Historical revenue">
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <CartesianGrid stroke="#eaedf1" vertical={false} />
                  <XAxis dataKey="month" stroke="#7d8693" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis stroke="#7d8693" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v))} width={48} />
                  <Tooltip formatter={(v: number) => `€${fmt(v)}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#3e5d80" fill="rgba(62,93,128,0.18)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Wishlist #4 — cross-link the drill-in to the Action Center renewal queue. */}
          <Section title="Next action">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="customer-stage-renewal"
                onClick={() =>
                  navigate(`/action-center?queue=renewals&customer=${customerId}&source=forecasting-customers`)
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90"
              >
                Stage renewal proposal <ExternalLink size={12} />
              </button>
              <button
                type="button"
                data-testid="customer-open-margin"
                onClick={() => navigate(`/margin?customer=${customerId}&source=forecasting-customers`)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
              >
                Open in margin cockpit <ExternalLink size={12} />
              </button>
              <button
                type="button"
                data-testid="customer-open-pricing"
                onClick={() => navigate(`/pricing?customer=${customerId}&source=forecasting-customers`)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
              >
                SKU drill in pricing studio <ExternalLink size={12} />
              </button>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DistRow({
  d,
  unit,
}: {
  d:
    | {
        median: number | null;
        p5: number | null;
        p25: number | null;
        p75: number | null;
        p95: number | null;
      }
    | undefined;
  unit: string;
}) {
  if (!d) return <div className="text-[12px] text-[var(--muted)]">Not available.</div>;
  return (
    <div className="grid grid-cols-5 gap-2 text-[12px]">
      {[
        { label: 'P5', value: d.p5 },
        { label: 'P25', value: d.p25 },
        { label: 'Median', value: d.median },
        { label: 'P75', value: d.p75 },
        { label: 'P95', value: d.p95 },
      ].map((s) => (
        <div
          key={s.label}
          className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2 py-1.5 text-center"
        >
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {s.label}
          </div>
          <div className="font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">
            {s.value != null
              ? unit === '€'
                ? `€${fmt(s.value)}`
                : `${s.value.toFixed(1)}${unit}`
              : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}
