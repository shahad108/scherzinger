import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useForecast } from '@/data/api/useForecast';
import { PageHead } from './components/PageHead';
import { HeroForecast } from './components/HeroForecast';
import { ModeToggle } from './components/ModeToggle';
import { TornadoCard } from './components/TornadoCard';
import { DistributionGrid } from './components/DistributionGrid';
import { ClusterLens } from './components/ClusterLens';
import { WalkForward } from './components/WalkForward';
import { InputCostTrajectory } from './components/InputCostTrajectory';
import { ParetoLayer } from './components/ParetoLayer';
import { PriceFloor } from './components/PriceFloor';
import { NewProductForecast } from './components/NewProductForecast';
import { CrossLinkStrip } from './components/CrossLinkStrip';
import { ForecastSkeleton } from './components/ForecastSkeleton';
import { MethodologyPanel } from './components/MethodologyPanel';
import { AssumptionsFooter } from './components/AssumptionsFooter';
import { MarginTrajectoryCard } from './components/MarginTrajectoryCard';
import { CostDecompositionCard } from './components/CostDecompositionCard';
import { SeasonalOverlayCard } from './components/SeasonalOverlayCard';
import { CommodityTrajectoriesCard } from './components/CommodityTrajectoriesCard';
import { PerCustomerTab } from './components/PerCustomerTab';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { ScenarioActiveBanner } from './components/ScenarioActiveBanner';
import { ScenarioCompareView } from './components/ScenarioCompareView';
import { QuoteToRevenueBridge } from './components/QuoteToRevenueBridge';
import { CalibrationCard } from './components/CalibrationCard';
import { MarketDirectionStrip } from './components/MarketDirectionStrip';
import { BriefingButton } from './components/BriefingButton';
import { HeroKPIStrip } from './components/HeroKPIStrip';
import { PVMWaterfall } from './components/PVMWaterfall';
import { TopSKUsForecastTable } from './components/TopSKUsForecastTable';
import { OverrideLog } from './components/OverrideLog';
import { Accordion } from '@/components/Accordion';
// v2.1 — plan-first, pocket-margin, prescriptive bridge.
import { PlanTrackingStrip } from './components/PlanTrackingStrip';
import { PocketWaterfallCard } from './components/PocketWaterfallCard';
import { BiasCard } from './components/BiasCard';
import { NextCycleMovesStrip } from './components/NextCycleMovesStrip';
import { DiagnosticsAccordionToggle } from './components/DiagnosticsAccordionToggle';
import type { ForecastMode, ForecastShell } from '@/types/forecast';

const QUEUE_TO_BLOCK: Record<string, string> = {
  renewals: 'block-renewals',
  price_floor: 'block-renewals',
};

type ForecastTab = 'aggregate' | 'customers';

export default function ForecastingPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queue = params.get('queue');
  const article = params.get('article');
  const source = params.get('source');

  const modeParam = (params.get('mode') as ForecastMode | null) ?? 'revenue';
  const horizonParam = Number(params.get('horizon')) || 12;
  const tab = ((params.get('tab') as ForecastTab) ?? 'aggregate') as ForecastTab;

  const scenarioId = params.get('scenario_id') ?? undefined;
  // Phase 4.5 audit fix: plumb header filter pills (tier/family/cluster) into
  // the BFF query so downstream sections actually re-fetch when the user
  // narrows the lens. The BFF already accepts these query params.
  const tierParam = params.get('tier') ?? undefined;
  const familyParam = params.get('family') ?? undefined;
  const clusterParam = params.get('cluster') ?? undefined;
  const showAll = params.get('show_all') === '1';
  // Phase 8: v2 is now the default layout. The legacy aggregate view stays
  // reachable via ?layout=v1 as a rollback path. Removing the v1 branch is a
  // follow-up once Frank has signed off on v2 in production.
  const layoutV2 = params.get('layout') !== 'v1';
  const forecastParams = useMemo(
    () => ({
      mode: modeParam,
      horizon: horizonParam,
      scenario_id: scenarioId,
      tier: (tierParam as 'A' | 'B' | 'C' | 'D' | undefined) ?? undefined,
      family: familyParam,
      cluster: clusterParam,
    }),
    [modeParam, horizonParam, scenarioId, tierParam, familyParam, clusterParam],
  );
  const { data, isLoading } = useForecast(forecastParams);
  // Phase 1 cleanup: the BFF /screens/forecast already applies scenario_id
  // and re-runs the composer for the active mode/horizon — read tornado +
  // distributions from `data` so the scenario perturbation propagates.
  // (The dedicated `/forecast/tornado` and `/forecast/distributions` hooks
  // remain available for components that want independent invalidation.)

  useEffect(() => {
    if (!data || !queue) return;
    const blockId = QUEUE_TO_BLOCK[queue];
    if (!blockId) return;
    // Phase 8 review (finding 6): the renewals block now lives inside a
    // collapsed Accordion. Tell the matching accordion to open before we try
    // to scroll its panel into view. Accordions whose `id !== blockId` ignore
    // the event.
    window.dispatchEvent(
      new CustomEvent('accordion:open', { detail: { id: blockId } }),
    );
    // Let React commit the open-state before measuring scroll target.
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(blockId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.dataset.focusPulse = '1';
    });
    const t = window.setTimeout(() => {
      const el = document.getElementById(blockId);
      if (el) delete el.dataset.focusPulse;
    }, 2200);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [data, queue]);

  if (isLoading || !data) {
    return <ForecastSkeleton />;
  }

  const setTab = (next: ForecastTab) => {
    const p = new URLSearchParams(params);
    if (next === 'aggregate') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <section id="screen-forecast" className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHead header={data.header} methodology={data.methodology} hero={data.hero} dataThrough={data.dataThrough} />
      {data.marketDirection && <MarketDirectionStrip data={data.marketDirection} />}
      <div className="mb-3 flex items-center justify-end">
        <BriefingButton />
      </div>
      {(queue || article) && (
        <div className="mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-[12.5px] text-[var(--ink)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {source ? `From ${source.replace(/-/g, ' ')}` : 'Deep link'}
              </div>
              <div className="mt-0.5 font-display text-[14px] font-bold tracking-tight">
                {queue === 'renewals' ? 'Renewal queue' : queue}
                {article ? ` · article ${article}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {source && (
                <button
                  type="button"
                  onClick={() => navigate(source === 'action-center' ? '/action-center' : `/${source}`)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
                >
                  <ArrowLeft size={12} />
                  Back
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss banner"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  ['queue', 'article', 'source'].forEach((k) => next.delete(k));
                  setParams(next, { replace: true });
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-2)]"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
      <ScenarioLibrary />
      {scenarioId && (
        <ScenarioActiveBanner scenarioId={scenarioId} applied={data.scenarioApplied} />
      )}
      <ScenarioCompareView modeParam={modeParam} horizonParam={horizonParam} />
      <ModeToggle active={modeParam} horizonMonths={horizonParam as 3 | 6 | 12} />

      <div role="tablist" aria-label="Forecast view" className="mb-4 inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_var(--hairline)]" data-testid="forecast-tabs">
        {(['aggregate', 'customers'] as ForecastTab[]).map((t) => {
          const isActive = t === tab;
          return (
            <button
              key={t}
              role="tab"
              type="button"
              data-testid={`forecast-tab-${t}`}
              aria-selected={isActive}
              onClick={() => setTab(t)}
              className={
                isActive
                  ? 'rounded-full bg-[var(--rose-bg)] px-4 py-1.5 text-[12.5px] font-semibold text-[var(--rose-deep)]'
                  : 'rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-soft)]'
              }
            >
              {t === 'aggregate' ? 'Aggregate & clusters' : 'Per customer'}
            </button>
          );
        })}
      </div>

      {tab === 'customers' ? (
        <PerCustomerTab />
      ) : (
        <AggregateView data={data} article={article} mode={modeParam} showAll={showAll} layoutV2={layoutV2} />
      )}

      <CrossLinkStrip />
    </section>
  );
}

interface AggregateProps {
  data: ForecastShell;
  article: string | null;
  mode: ForecastMode;
  showAll: boolean;
  layoutV2: boolean;
}

function AggregateView({ data, article, mode, showAll, layoutV2 }: AggregateProps) {
  if (layoutV2) {
    return <AggregateViewV2 data={data} article={article} mode={mode} showAll={showAll} />;
  }
  return <AggregateViewV1 data={data} article={article} mode={mode} showAll={showAll} />;
}

function AggregateViewV1({ data, article, mode, showAll }: Omit<AggregateProps, 'layoutV2'>) {
  return (
    <>
      {data.tornado && <TornadoCard tornado={data.tornado} />}
      {data.distributions && (
        <DistributionGrid distributions={data.distributions} clusters={data.clusters} />
      )}
      {data.quoteToRevenue && <QuoteToRevenueBridge data={data.quoteToRevenue} />}
      {data.marginTrajectory && <MarginTrajectoryCard data={data.marginTrajectory} />}
      {data.costDecomposition && <CostDecompositionCard data={data.costDecomposition} />}
      {data.seasonalOverlay && <SeasonalOverlayCard data={data.seasonalOverlay} />}
      {data.commodityTrajectories && (
        <CommodityTrajectoriesCard data={data.commodityTrajectories} />
      )}
      {data.calibration && <CalibrationCard data={data.calibration} />}
      <HeroForecast hero={data.hero} mode={mode} />
      <ClusterLens clusters={data.clusters} />
      <WalkForward panel={data.walkForward} />
      <InputCostTrajectory data={data.inputCost} />
      <ParetoLayer data={data.pareto} showAll={showAll} />
      <div id="block-renewals" data-focus-target="renewals">
        <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} highlightArticle={article} />
      </div>
      <NewProductForecast data={data.newProduct} />
      {data.methodology && (
        <>
          <AssumptionsFooter
            assumptions={data.methodology.assumptions}
            dataThrough={
              data.methodology.assumptions.find((a) => a.label === 'Data-through')?.value
            }
          />
          <MethodologyPanel methodology={data.methodology} />
        </>
      )}
    </>
  );
}

function AggregateViewV2({ data, article, mode, showAll }: Omit<AggregateProps, 'layoutV2'>) {
  // Phase 9: when a cluster filter (?cluster=BKAES) is active, any override the
  // user creates from the hero chart must be tagged with that cluster — not
  // attributed to the aggregate. We read the param here and pass it through to
  // HeroForecast → ActualEntryPanel.
  const [clusterParams] = useSearchParams();
  const activeCluster = clusterParams.get('cluster') ?? null;
  // Derive KPI inputs from the existing ForecastHero shape. Optional new fields
  // (forecast12moTotal, varianceVsPlanPct, mapeTrailing6mo, fva) are honored
  // when present, otherwise computed from `series` or filled with safe zeros.
  const series = data.hero?.series ?? [];
  const derivedForecast12mo = series
    .slice(-12)
    .reduce((acc, p) => acc + (p.p50 ?? p.primary ?? 0), 0);
  const forecast12mo = data.hero?.forecast12moTotal ?? derivedForecast12mo;
  const varianceVsPlanPct = data.hero?.varianceVsPlanPct ?? 0;
  const mape =
    data.hero?.mapeTrailing6mo ??
    (typeof data.walkForward?.target === 'number' ? data.walkForward.target : 0);
  const fva =
    data.hero?.fva ?? { score: 0, verdict: 'neutral' as const, n: 0 };

  return (
    <>
      {/* v2.1 — PlanTrackingStrip sits ABOVE the KPI strip so finance/Manuel
          see plan-vs-actual first. */}
      <PlanTrackingStrip data={data.planTracking} />
      <HeroKPIStrip
        forecast12mo={forecast12mo}
        varianceVsPlanPct={varianceVsPlanPct}
        mape={mape}
        fva={fva}
        mode={mode}
      />
      <HeroForecast hero={data.hero} mode={mode} cluster={activeCluster} enableActualEntry />
      {/* v2.1 — Prescriptive bridge directly under the forecast: "what should
          I do this cycle?" v2.2 Phase B: each card now dispatches a typed
          ActionIntent via useUiAction(), opening the global Action drawer. */}
      <NextCycleMovesStrip moves={data.nextMoves} />
      {data.pvm && (
        <PVMWaterfall
          periodLabel={data.pvm.periodLabel}
          bars={data.pvm.bars}
          mode={mode}
        />
      )}
      {/* v2.1 — PocketWaterfallCard promoted out of the Drivers accordion
          because pocket-margin leakage is decision-relevant, not diagnostic. */}
      <PocketWaterfallCard data={data.pocketWaterfall} />
      {data.pareto?.sku?.rows?.length ? (
        <TopSKUsForecastTable
          rows={data.pareto.sku.rows}
          limit={10}
          footnote={data.pareto.sku.footnote}
        />
      ) : null}
      <ClusterLens clusters={data.clusters} />
      {/* ScenarioLibrary is rendered once at the page-shell level (see
          ForecastingPage). Phase 8 review removed the duplicate that used to
          live here. */}
      {data.activeScenarioId && (
        <ScenarioActiveBanner scenarioId={data.activeScenarioId} applied={data.scenarioApplied} />
      )}
      {/* Drivers accordion — v2.1 reordered: decision-relevant cards
          (WalkForward, Calibration, BiasCard, Tornado, Distributions,
          Quote→Revenue, MarginTrajectory) visible by default; the four
          deeper diagnostics collapsed behind a single toggle. */}
      <Accordion title="Drivers & accuracy" defaultOpen={false}>
        <WalkForward panel={data.walkForward} />
        {data.calibration && <CalibrationCard data={data.calibration} />}
        <BiasCard data={data.bias} />
        {data.tornado && <TornadoCard tornado={data.tornado} />}
        {data.distributions && (
          <DistributionGrid distributions={data.distributions} clusters={data.clusters} />
        )}
        {data.quoteToRevenue && <QuoteToRevenueBridge data={data.quoteToRevenue} />}
        {data.marginTrajectory && <MarginTrajectoryCard data={data.marginTrajectory} />}
        <DiagnosticsAccordionToggle count={4}>
          {data.seasonalOverlay && <SeasonalOverlayCard data={data.seasonalOverlay} />}
          {data.commodityTrajectories && (
            <CommodityTrajectoriesCard data={data.commodityTrajectories} />
          )}
          {data.costDecomposition && <CostDecompositionCard data={data.costDecomposition} />}
          <InputCostTrajectory data={data.inputCost} />
        </DiagnosticsAccordionToggle>
      </Accordion>
      <Accordion title="Renewals & new product" id="block-renewals" defaultOpen={false}>
        <div data-focus-target="renewals">
          <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} highlightArticle={article} />
        </div>
        <NewProductForecast data={data.newProduct} />
      </Accordion>
      <ParetoLayer data={data.pareto} showAll={showAll} />
      <OverrideLog />
      {data.methodology && (
        <>
          <AssumptionsFooter
            assumptions={data.methodology.assumptions}
            dataThrough={
              data.dataThrough ??
              data.methodology.assumptions.find((a) => a.label === 'Data-through')?.value
            }
          />
          <MethodologyPanel methodology={data.methodology} />
        </>
      )}
    </>
  );
}
