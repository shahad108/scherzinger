// Pricing Studio v3 / Phase 8 — Simulation Drawer (520px right-rail).
//
// Opened from "Simulate this option" on any price option card. Body shows:
//
//   - Header: "Simulate €X vs hold · {aid}"
//   - Scenarios table: low / mid / high  →  12mo Δrev, ΔDB2, churn-risk
//   - Recharts AreaChart: 3 fan-bands over 12 months
//   - Footer: "Set as proposal" (create proposal via existing Phase 5
//     mutation) + "Run as A/B" (raises a callback so the parent can
//     scroll to the ABTestCard and pre-fill it).
//
// Read-only on the backend — POST /pricing/simulate writes nothing.

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { fmt } from '@/lib/format';
import { useSimulation, type SimulationResponse } from '@/data/api/useSimulation';
import { useCreateProposal } from '@/data/api/useProposals';
import { parseDecimal } from '@/features/pricing-studio/lib/decimal';

export interface SimulationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aid: string;
  /** Decimal-as-string. The variant price being simulated. */
  variantPrice: string;
  /** Decimal-as-string. The "hold" / current control price. */
  controlPrice: string;
  /** Optional eligibility passthrough. Defaults to null. */
  eligibility?: Record<string, unknown> | null;
  /** "Set as proposal" callback — fires when the proposal is created. */
  onProposalCreated?: (proposalId: string) => void;
  /** "Run as A/B" — opens the parent's ABTestCard pre-filled. */
  onRunAsAbTest?: (variantPrice: string, controlPrice: string) => void;
}

export function SimulationDrawer({
  open,
  onOpenChange,
  aid,
  variantPrice,
  controlPrice,
  eligibility,
  onProposalCreated,
  onRunAsAbTest,
}: SimulationDrawerProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      width={520}
      title={`Simulate ${variantPrice} · ${aid}`}
    >
      {open && (
        <SimulationDrawerBody
          aid={aid}
          variantPrice={variantPrice}
          controlPrice={controlPrice}
          eligibility={eligibility}
          onProposalCreated={(id) => {
            onProposalCreated?.(id);
            onOpenChange(false);
          }}
          onRunAsAbTest={() => {
            onRunAsAbTest?.(variantPrice, controlPrice);
            onOpenChange(false);
          }}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Drawer>
  );
}

interface BodyProps {
  aid: string;
  variantPrice: string;
  controlPrice: string;
  eligibility?: Record<string, unknown> | null;
  onProposalCreated: (id: string) => void;
  onRunAsAbTest: () => void;
  onClose: () => void;
}

function SimulationDrawerBody({
  aid,
  variantPrice,
  controlPrice,
  eligibility,
  onProposalCreated,
  onRunAsAbTest,
}: BodyProps) {
  const simulate = useSimulation();
  const createProposal = useCreateProposal();
  const [data, setData] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variantDecimal = parseDecimal(variantPrice);
  const controlDecimal = parseDecimal(controlPrice);

  useEffect(() => {
    if (!Number.isFinite(variantDecimal) || !Number.isFinite(controlDecimal)) {
      setError('Invalid price input.');
      return;
    }
    setError(null);
    simulate.mutate(
      {
        aid,
        control_price: controlDecimal.toFixed(2),
        variant_price: variantDecimal.toFixed(2),
        eligibility: eligibility ?? null,
        target_sample: 30,
        horizon_months: 12,
      },
      {
        onSuccess: (res) => setData(res),
        onError: (err) => setError(err.message),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aid, variantPrice, controlPrice]);

  const fanData = useMemo(() => data?.fan_band_chart_data ?? [], [data]);

  // Phase D parity — keep only first / last / current-tick on the x-axis so
  // the 12-month series doesn't crowd labels at the bottom of the chart.
  const tickMonths = useMemo(() => {
    if (fanData.length === 0) return new Set<number>();
    const first = fanData[0].month;
    const last = fanData[fanData.length - 1].month;
    const mid = fanData[Math.floor(fanData.length / 2)].month;
    return new Set<number>([first, mid, last]);
  }, [fanData]);

  async function handleSetAsProposal() {
    if (!Number.isFinite(variantDecimal)) return;
    try {
      const row = await createProposal.mutateAsync({
        article_id: aid,
        current_price: controlDecimal.toFixed(2),
        proposed_price: variantDecimal.toFixed(2),
        delta_pp:
          controlDecimal !== 0
            ? Number((((variantDecimal - controlDecimal) / controlDecimal) * 100).toFixed(2))
            : 0,
        payload: {
          source: 'simulation',
          scenarios: data?.scenarios ?? null,
        },
      });
      onProposalCreated(row.id);
    } catch {
      // Surfaced via mutation state below.
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="simulation-drawer-body">
      <header className="border-b border-gray-100 px-6 py-4">
        <p className="text-[11px] uppercase tracking-wide text-gray-500">
          Simulation · {aid}
        </p>
        <h3 className="mt-0.5 text-base font-semibold text-gray-900">
          Simulate €{variantDecimal.toFixed(2)} vs hold €{controlDecimal.toFixed(2)}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Read-only. No quotes, proposals, or audits are written by this view.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {simulate.isPending && (
          <div className="py-12 text-center text-sm text-gray-500">Simulating…</div>
        )}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}
        {data && (
          <>
            <ScenariosTable data={data} />
            <div className="mt-4">
              <h4 className="mb-1 text-xs font-medium text-gray-700">
                12-month revenue fan-band (€)
              </h4>
              <p className="mb-2 text-[11px] text-gray-500">
                Cumulative revenue delta vs hold across low / mid / high scenarios.
              </p>
              <div className="h-56" data-testid="sim-fan-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fanData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="simRange" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--rose-deep, #be123c)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--rose-deep, #be123c)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--hairline, #f3f4f6)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: 'var(--muted, #6b7280)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--hairline, #e5e7eb)' }}
                      tickFormatter={(v: number) => (tickMonths.has(v) ? `M${v}` : '')}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--muted, #6b7280)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--hairline, #e5e7eb)' }}
                      interval="preserveStartEnd"
                      tickCount={3}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(v: number) => fmt.eur(v)}
                      labelFormatter={(m) => `Month ${m}`}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 0 }}
                      verticalAlign="top"
                      align="right"
                      height={18}
                    />
                    <Area
                      type="monotone"
                      dataKey="high"
                      name="High"
                      stroke="var(--rose-deep, #be123c)"
                      fill="url(#simRange)"
                      strokeWidth={1.75}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="mid"
                      name="Mid"
                      stroke="var(--rose-deep, #be123c)"
                      fill="transparent"
                      strokeWidth={1.75}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="low"
                      name="Low"
                      stroke="var(--rose-deep, #be123c)"
                      fill="transparent"
                      strokeDasharray="4 3"
                      strokeWidth={1.75}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {data.lineage_ref && (
                <div className="mt-1 text-[10px] text-gray-400">
                  lineage_ref · {data.lineage_ref.slice(0, 8)}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-6 py-3">
        <Button
          size="sm"
          onClick={handleSetAsProposal}
          disabled={createProposal.isPending || !data}
          data-testid="sim-set-as-proposal"
        >
          {createProposal.isPending ? 'Creating…' : 'Set as proposal'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onRunAsAbTest}
          disabled={!data}
          data-testid="sim-run-as-ab"
        >
          Run as A/B
        </Button>
        {createProposal.isError && (
          <span className="text-[11px] text-rose-600">
            Could not create proposal.
          </span>
        )}
      </footer>
    </div>
  );
}

interface ScenariosTableProps {
  data: SimulationResponse;
}

function ScenariosTable({ data }: ScenariosTableProps) {
  const rows = [
    { key: 'low', label: 'Low', tone: 'text-amber-700', s: data.scenarios.low },
    { key: 'mid', label: 'Mid', tone: 'text-rose-700', s: data.scenarios.mid },
    { key: 'high', label: 'High', tone: 'text-emerald-700', s: data.scenarios.high },
  ];
  return (
    <table
      className="w-full text-xs tabular-nums"
      data-testid="sim-scenarios-table"
    >
      <thead>
        <tr className="text-left text-gray-500">
          <th className="w-20 py-1 font-medium">Scenario</th>
          <th className="py-1 font-medium">12mo Δ revenue</th>
          <th className="py-1 font-medium">12mo Δ DB2</th>
          <th className="py-1 font-medium">Churn risk</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-gray-100">
            <td className={`py-1.5 font-medium ${r.tone}`}>{r.label}</td>
            <td className="py-1.5">{signedEur(r.s.revenue_delta_12mo)}</td>
            <td className="py-1.5">{signedEur(r.s.db2_delta_12mo)}</td>
            <td className="py-1.5">{signedPp(r.s.churn_risk_pp)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-gray-100 text-[11px] text-gray-500">
          <td colSpan={4} className="pt-2">
            n_eligible = {data.n_eligible} · sample = {data.sample_size}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function signedEur(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${fmt.eur(Math.abs(value))}`;
}

function signedPp(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(1)}pp`;
}
