import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useForecast } from '@/data/api/useForecast';
import { useTornado } from '@/data/api/useTornado';
import { useDistributions } from '@/data/api/useDistributions';
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
import type {
  ForecastDistributions,
  ForecastMode,
  ForecastShell,
  ForecastTornado,
} from '@/types/forecast';

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

  const forecastParams = useMemo(
    () => ({ mode: modeParam, horizon: horizonParam }),
    [modeParam, horizonParam],
  );
  const { data, isLoading } = useForecast(forecastParams);

  const simulatorMetric = modeParam === 'volume' ? 'quantity' : modeParam;
  const { data: tornadoData } = useTornado({
    entity_type: 'commodity_group',
    metric: simulatorMetric,
    horizon_months: horizonParam,
  });
  const { data: distributionsData } = useDistributions({
    entity_type: 'commodity_group',
    metric: simulatorMetric,
    horizon_months: horizonParam,
  });

  useEffect(() => {
    if (!data || !queue) return;
    const blockId = QUEUE_TO_BLOCK[queue];
    if (!blockId) return;
    const el = document.getElementById(blockId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.dataset.focusPulse = '1';
    const t = window.setTimeout(() => {
      delete el.dataset.focusPulse;
    }, 2200);
    return () => window.clearTimeout(t);
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
      <PageHead header={data.header} />
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
        <AggregateView
          data={data}
          tornadoData={tornadoData}
          distributionsData={distributionsData}
          article={article}
        />
      )}

      <CrossLinkStrip />
    </section>
  );
}

interface AggregateProps {
  data: ForecastShell;
  tornadoData?: ForecastTornado;
  distributionsData?: ForecastDistributions;
  article: string | null;
}

function AggregateView({ data, tornadoData, distributionsData, article }: AggregateProps) {
  return (
    <>
      {(tornadoData ?? data.tornado) && (
        <TornadoCard tornado={tornadoData ?? data.tornado} />
      )}
      {(distributionsData ?? data.distributions) && (
        <DistributionGrid distributions={distributionsData ?? data.distributions} />
      )}
      {data.marginTrajectory && <MarginTrajectoryCard data={data.marginTrajectory} />}
      {data.costDecomposition && <CostDecompositionCard data={data.costDecomposition} />}
      {data.seasonalOverlay && <SeasonalOverlayCard data={data.seasonalOverlay} />}
      {data.commodityTrajectories && (
        <CommodityTrajectoriesCard data={data.commodityTrajectories} />
      )}
      <HeroForecast hero={data.hero} />
      <ClusterLens clusters={data.clusters} />
      <WalkForward panel={data.walkForward} />
      <InputCostTrajectory data={data.inputCost} />
      <ParetoLayer data={data.pareto} />
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
