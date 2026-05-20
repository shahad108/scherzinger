// Pricing Studio v3 / Phase 8 — A/B vs hold card inside PriceOptions.
//
// Two states:
//
//   1. NO ACTIVE TEST  → setup form (variant/control prices, eligibility,
//      target sample, criterion). "Set up A/B test" POSTs to /ab-tests.
//   2. ACTIVE TEST     → scoring strip (per-arm sample bars + decision
//      buttons when `scoring.decision_ready` is true).
//
// Eligibility editor: simple "tier + family" fields by default; an
// "Advanced" toggle reveals a jsonlogic textarea for power users (Frank).
// The simple form serialises to `{ tier: ['B','C'], family: 'mh' }`
// which the backend's eligibility evaluator understands.
//
// Design language: rose-500 primary, amber accents for "active test"
// state, emerald for "decision ready", warm-gray neutrals.

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { parseDecimal } from '@/features/pricing-studio/lib/decimal';
import {
  useCreateAbTest,
  useDecideAbTest,
  type AbTestCreateBody,
} from '@/data/api/useAbTest';
import type { ActiveAbTestSummary } from '@/types/studio';

export interface ABTestCardProps {
  aid: string;
  /** Pre-filled control price. Decimal-as-string or labelled "€xxx". */
  defaultControlPrice: string;
  /** Pre-filled variant price. Decimal-as-string or labelled "€xxx". */
  defaultVariantPrice: string;
  /** Pre-filled eligibility from the option, e.g. {tier: ['B','C']}. */
  defaultEligibility?: Record<string, unknown> | null;
  /** Active test summary if one exists. */
  activeTest?: ActiveAbTestSummary | null;
  /** Optional callback fired after a successful POST /ab-tests. */
  onCreated?: (testId: string) => void;
}

const DEFAULT_TARGET = 30;
const DEFAULT_CRITERION = {
  metric: 'db2_margin',
  delta_pp: 2,
  sided: 'one',
  alpha: 0.1,
} as const;

// Strip currency symbols + thousands separators → plain decimal string.
function normaliseDecimal(input: string): string {
  if (!input) return '';
  const cleaned = input.replace(/[€\s]/g, '').replace(/,/g, '.');
  return cleaned;
}

interface SimpleEligibility {
  tiers: string[];
  family: string;
}

function eligibilityToSimple(elig: Record<string, unknown> | null | undefined): SimpleEligibility {
  if (!elig) return { tiers: [], family: '' };
  const tiersRaw = (elig.tier as unknown) ?? (elig.tiers as unknown);
  const tiers = Array.isArray(tiersRaw) ? tiersRaw.map(String) : [];
  const family = typeof elig.family === 'string' ? elig.family : '';
  return { tiers, family };
}

function simpleToEligibility(simple: SimpleEligibility): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (simple.tiers.length) out.tier = simple.tiers;
  if (simple.family) out.family = simple.family;
  return Object.keys(out).length ? out : null;
}

export function ABTestCard({
  aid,
  defaultControlPrice,
  defaultVariantPrice,
  defaultEligibility,
  activeTest,
  onCreated,
}: ABTestCardProps) {
  if (activeTest) {
    return (
      <ABTestActivePane
        activeTest={activeTest}
      />
    );
  }
  return (
    <ABTestSetupPane
      aid={aid}
      defaultControlPrice={defaultControlPrice}
      defaultVariantPrice={defaultVariantPrice}
      defaultEligibility={defaultEligibility}
      onCreated={onCreated}
    />
  );
}

// ---------------------------------------------------------------------------
// Setup pane
// ---------------------------------------------------------------------------

interface SetupPaneProps {
  aid: string;
  defaultControlPrice: string;
  defaultVariantPrice: string;
  defaultEligibility?: Record<string, unknown> | null;
  onCreated?: (testId: string) => void;
}

function ABTestSetupPane({
  aid,
  defaultControlPrice,
  defaultVariantPrice,
  defaultEligibility,
  onCreated,
}: SetupPaneProps) {
  const create = useCreateAbTest();
  const [controlPrice, setControlPrice] = useState(normaliseDecimal(defaultControlPrice));
  const [variantPrice, setVariantPrice] = useState(normaliseDecimal(defaultVariantPrice));
  const [targetSample, setTargetSample] = useState(DEFAULT_TARGET);
  const [simple, setSimple] = useState<SimpleEligibility>(
    eligibilityToSimple(defaultEligibility),
  );
  const [advanced, setAdvanced] = useState(false);
  const [advancedJson, setAdvancedJson] = useState<string>(
    defaultEligibility ? JSON.stringify(defaultEligibility, null, 2) : '',
  );
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

  useEffect(() => {
    setControlPrice(normaliseDecimal(defaultControlPrice));
  }, [defaultControlPrice]);
  useEffect(() => {
    setVariantPrice(normaliseDecimal(defaultVariantPrice));
  }, [defaultVariantPrice]);

  const eligibilitySummary = useMemo(() => {
    if (advanced) {
      try {
        const parsed = JSON.parse(advancedJson || '{}');
        if (Object.keys(parsed).length === 0) return 'all customers';
        return 'advanced rule';
      } catch {
        return 'invalid JSON';
      }
    }
    const tierPart = simple.tiers.length
      ? `Tier ${simple.tiers.join(',')}`
      : 'all tiers';
    const famPart = simple.family ? ` · ${simple.family}` : '';
    return `${tierPart}${famPart}`;
  }, [advanced, advancedJson, simple]);

  function buildBody(): AbTestCreateBody | null {
    const ctrl = parseDecimal(controlPrice);
    const variant = parseDecimal(variantPrice);
    if (!Number.isFinite(ctrl) || !Number.isFinite(variant)) return null;
    let eligibility: Record<string, unknown> | null = null;
    if (advanced) {
      try {
        const parsed = advancedJson ? JSON.parse(advancedJson) : null;
        eligibility = parsed && Object.keys(parsed).length ? parsed : null;
      } catch {
        return null;
      }
    } else {
      eligibility = simpleToEligibility(simple);
    }
    return {
      aid,
      control_price: ctrl.toFixed(2),
      variant_price: variant.toFixed(2),
      eligibility,
      target_sample: targetSample,
      criterion: { ...DEFAULT_CRITERION },
    };
  }

  async function handleSubmit() {
    const body = buildBody();
    if (!body) return;
    try {
      const res = await create.mutateAsync(body);
      onCreated?.(res.ab_test.id);
    } catch {
      // Surface via the disabled-state inline below.
    }
  }

  const disabled =
    create.isPending ||
    !controlPrice ||
    !variantPrice ||
    !Number.isFinite(parseDecimal(controlPrice)) ||
    !Number.isFinite(parseDecimal(variantPrice));

  return (
    <div
      className={cn(
        'rounded-lg border border-rose-100 bg-rose-50/40 p-4',
        'shadow-[var(--shadow-1)]',
      )}
      data-testid="ab-test-setup"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">A/B vs hold</h5>
          <p className="text-xs text-gray-600">
            Slice eligible customers; promote the winner.
          </p>
        </div>
        <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700">
          Setup
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">Variant (recommended)</span>
          <div className="flex h-9 items-center rounded-md border border-gray-200 bg-white px-2">
            <span className="mr-1 text-gray-400">€</span>
            <input
              type="number"
              step="0.01"
              value={variantPrice}
              onChange={(e) => setVariantPrice(e.target.value)}
              aria-label="Variant price"
              className="w-full bg-transparent outline-none text-sm tabular-nums"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">Control (hold)</span>
          <div className="flex h-9 items-center rounded-md border border-gray-200 bg-white px-2">
            <span className="mr-1 text-gray-400">€</span>
            <input
              type="number"
              step="0.01"
              value={controlPrice}
              onChange={(e) => setControlPrice(e.target.value)}
              aria-label="Control price"
              className="w-full bg-transparent outline-none text-sm tabular-nums"
            />
          </div>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700">
        <span className="font-medium text-gray-600">Eligibility:</span>
        <span className="tabular-nums">{eligibilitySummary}</span>
        <button
          type="button"
          onClick={() => setEligibilityOpen((v) => !v)}
          className="text-rose-700 underline-offset-2 hover:underline"
          aria-expanded={eligibilityOpen}
        >
          {eligibilityOpen ? 'Close eligibility' : 'Open eligibility'}
        </button>
      </div>

      {eligibilityOpen && (
        <div
          className="mt-2 rounded-md border border-gray-200 bg-white p-3"
          data-testid="ab-test-eligibility"
        >
          {!advanced ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700">Customer slice</div>
              <div className="flex flex-wrap gap-1.5">
                {['A', 'B', 'C', 'D'].map((tier) => {
                  const on = simple.tiers.includes(tier);
                  return (
                    <button
                      type="button"
                      key={tier}
                      onClick={() =>
                        setSimple((cur) => ({
                          ...cur,
                          tiers: on
                            ? cur.tiers.filter((t) => t !== tier)
                            : [...cur.tiers, tier],
                        }))
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                        on
                          ? 'border-rose-300 bg-rose-100 text-rose-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      Tier {tier}
                    </button>
                  );
                })}
              </div>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-600">Family (optional)</span>
                <input
                  type="text"
                  value={simple.family}
                  onChange={(e) => setSimple((c) => ({ ...c, family: e.target.value }))}
                  placeholder="e.g. mh, mechanical"
                  className="h-8 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-rose-300"
                />
              </label>
            </div>
          ) : (
            <label className="block text-xs">
              <span className="mb-1 inline-block text-gray-600">Advanced (jsonlogic)</span>
              <textarea
                value={advancedJson}
                onChange={(e) => setAdvancedJson(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full rounded-md border border-gray-200 bg-white p-2 font-mono text-[11px] outline-none focus:border-rose-300"
                placeholder='{ "tier": ["B","C"] }'
              />
            </label>
          )}
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="text-gray-600 hover:text-gray-700"
            >
              {advanced ? 'Use simple editor' : 'Advanced…'}
            </button>
            <label className="flex items-center gap-1.5 text-gray-600">
              <span>Target sample / arm</span>
              <input
                type="number"
                min={5}
                max={500}
                value={targetSample}
                onChange={(e) => setTargetSample(Number(e.target.value) || DEFAULT_TARGET)}
                className="h-7 w-16 rounded border border-gray-200 px-1.5 text-right tabular-nums outline-none focus:border-rose-300"
              />
            </label>
          </div>
        </div>
      )}

      <div className="mt-3 text-[11px] text-gray-600">
        <span className="font-medium text-gray-600">Decision criterion: </span>
        variant DB2 ≥ control DB2 + {DEFAULT_CRITERION.delta_pp}pp (one-sided, p&lt;
        {DEFAULT_CRITERION.alpha})
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={disabled}
          data-testid="ab-test-create"
        >
          {create.isPending ? 'Setting up…' : 'Set up A/B test'}
        </Button>
        {create.isError && (
          <span className="text-[11px] text-rose-700">
            Could not create test. Check eligibility.
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active scoring pane
// ---------------------------------------------------------------------------

interface ActivePaneProps {
  activeTest: ActiveAbTestSummary;
}

function ABTestActivePane({ activeTest }: ActivePaneProps) {
  const decide = useDecideAbTest(activeTest.test_id);
  const scoring = activeTest.scoring;
  const target = Math.max(1, activeTest.target_sample);
  const controlN = scoring?.control.n ?? 0;
  const variantN = scoring?.variant.n ?? 0;
  const controlPct = Math.min(100, (controlN / target) * 100);
  const variantPct = Math.min(100, (variantN / target) * 100);
  const decisionReady = Boolean(scoring?.decision_ready);
  const decided = activeTest.decision_state !== 'running';

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 shadow-[var(--shadow-1)]',
        decisionReady ? 'border-emerald-200' : 'border-amber-200',
      )}
      data-testid="ab-test-active"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">A/B vs hold · in flight</h5>
          <p className="text-xs text-gray-600">
            Variant €{Number(activeTest.variant_price).toFixed(2)} vs control €
            {Number(activeTest.control_price).toFixed(2)}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            decisionReady
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700',
          )}
        >
          {decisionReady ? 'Decision ready' : activeTest.decision_state}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <ArmRow
          label="Variant"
          n={variantN}
          target={target}
          pct={variantPct}
          tone="rose"
          margin={scoring?.variant.margin ?? null}
          revenue={scoring?.variant.revenue ?? 0}
        />
        <ArmRow
          label="Control"
          n={controlN}
          target={target}
          pct={controlPct}
          tone="gray"
          margin={scoring?.control.margin ?? null}
          revenue={scoring?.control.revenue ?? 0}
        />
      </div>

      {scoring && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
          {scoring.z_stat !== null && (
            <span>
              z = <span className="tabular-nums">{scoring.z_stat.toFixed(2)}</span>
            </span>
          )}
          {scoring.p_value !== null && (
            <span>
              p = <span className="tabular-nums">{scoring.p_value.toFixed(3)}</span>
            </span>
          )}
        </div>
      )}

      {!decided && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!decisionReady || decide.isPending}
            onClick={() => decide.mutate({ decision: 'promote' })}
            data-testid="ab-test-promote"
          >
            Promote variant
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ decision: 'hold' })}
            data-testid="ab-test-hold"
          >
            Hold
          </Button>
          {!decisionReady && (
            <span className="text-[11px] text-gray-600">
              Waiting for {Math.max(0, target - Math.min(controlN, variantN))} more
              quotes per arm.
            </span>
          )}
        </div>
      )}

      {decided && (
        <div className="mt-3 text-[11px] text-gray-600">
          Decision: <strong>{activeTest.decision_state}</strong>
        </div>
      )}
    </div>
  );
}

interface ArmRowProps {
  label: string;
  n: number;
  target: number;
  pct: number;
  tone: 'rose' | 'gray';
  margin: number | null;
  revenue: number;
}

function ArmRow({ label, n, target, pct, tone, margin, revenue }: ArmRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-600">
          {n}/{target} quotes
          {margin !== null && <> · margin {(margin * 100).toFixed(1)}%</>}
          {revenue !== 0 && <> · €{Math.round(revenue).toLocaleString()}</>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            tone === 'rose' ? 'bg-rose-500' : 'bg-gray-400',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
