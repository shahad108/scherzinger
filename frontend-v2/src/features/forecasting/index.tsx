import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useForecast } from '@/data/api/useForecast';
import { PageHead } from './components/PageHead';
import { HeroForecast } from './components/HeroForecast';
import { ClusterLens } from './components/ClusterLens';
import { WalkForward } from './components/WalkForward';
import { InputCostTrajectory } from './components/InputCostTrajectory';
import { ParetoLayer } from './components/ParetoLayer';
import { PriceFloor } from './components/PriceFloor';
import { NewProductForecast } from './components/NewProductForecast';
import { CrossLinkStrip } from './components/CrossLinkStrip';
import { ForecastSkeleton } from './components/ForecastSkeleton';

// Phase 2 — queue values the deep-link CTAs may pass via `?queue=`.
// Each entry maps to the DOM id of the block to scroll into view.
const QUEUE_TO_BLOCK: Record<string, string> = {
  renewals: 'block-renewals',
  price_floor: 'block-renewals',
};

export default function ForecastingPage() {
  const { data, isLoading } = useForecast();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queue = params.get('queue');
  const article = params.get('article');
  const source = params.get('source');

  // Scroll + pulse when ?queue=renewals lands here.
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
      <HeroForecast hero={data.hero} />
      <ClusterLens clusters={data.clusters} />
      <WalkForward panel={data.walkForward} />
      <InputCostTrajectory data={data.inputCost} />
      <ParetoLayer data={data.pareto} />
      <div id="block-renewals" data-focus-target="renewals">
        <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} highlightArticle={article} />
      </div>
      <NewProductForecast data={data.newProduct} />
      <CrossLinkStrip />
    </section>
  );
}
