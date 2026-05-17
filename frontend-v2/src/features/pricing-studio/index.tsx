import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStudio } from '@/data/api/useStudio';
import { useLivePricing } from '@/hooks/useLivePricing';
import { PageHead } from './components/PageHead';
import { SkuPicker } from './components/SkuPicker';
import { WorkbenchHero, type HeroView } from './components/WorkbenchHero';
import { PriceOptions, type ActiveOptionView } from './components/PriceOptions';
import { CustomerFanout } from './components/CustomerFanout';
import { CostHistory } from './components/CostHistory';
import { ComparablePanel } from './components/ComparablePanel';
import { DecisionFooter } from './components/DecisionFooter';
import { RationaleMemo } from './components/RationaleMemo';
import { CrossLinks } from './components/CrossLinks';
import { StudioSkeleton } from './components/StudioSkeleton';
import { DeepLinkBanner } from './components/DeepLinkBanner';
import { ProposalContextPanel } from './components/ProposalContextPanel';
// Pricing Studio v3 / Phase 1 — new top-of-workbench surfaces.
import { RecommendationHero } from './components/RecommendationHero';
import { RecommendationKpiTiles } from './components/RecommendationKpiTiles';
import { WtpBandStrip } from './components/WtpBandStrip';
import { WinProbCurve } from './components/WinProbCurve';
import { DriverWaterfall } from './components/DriverWaterfall';
import { LineageDrawer } from './components/LineageDrawer';
import { LineageDrawerProvider } from './lineage/LineageDrawerContext';
import { parseDecimal } from './lib/decimal';

export default function PricingStudioPage() {
  const [params, setParams] = useSearchParams();
  // Phase 21 — full deep-link filter quartet flows through `useStudio` so a
  // refresh preserves the exact slice the user landed on.
  const studioParams = {
    aid: params.get('aid') ?? undefined,
    tier: params.get('tier') ?? undefined,
    family: params.get('family') ?? undefined,
    cluster: params.get('cluster') ?? undefined,
    scenario_id: params.get('scenario_id') ?? undefined,
  };
  const { data, isLoading } = useStudio(studioParams);
  // Pricing Studio v3 / Phase 1 — live-wired tick + toast surface. The data
  // we read from `useStudio` above is still authoritative; this hook just
  // invalidates that cache and surfaces lastTickAt for the freshness chip.
  const live = useLivePricing(studioParams);
  // Phase 2 — `aid` from the URL drives initial selection so deep links
  // from Action Center / Margin / Forecasting land on the exact SKU.
  // Local state then overrides if the user picks a different SKU.
  const urlAid = params.get('aid');
  const [selectedAid, setSelectedAid] = useState<string | null>(urlAid);
  const [activeOption, setActiveOption] = useState<ActiveOptionView | null>(null);

  // Phase 21 — SKU-picker clicks must update the URL so refresh preserves
  // the selection. Wrap setSelectedAid + setSearchParams in a single handler
  // so the existing SkuPicker prop contract is unchanged.
  const handleSelectSku = (aid: string) => {
    setSelectedAid(aid);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('aid', aid);
      return next;
    });
  };

  useEffect(() => {
    document.body.classList.add('pz-fullbleed');
    return () => {
      document.body.classList.remove('pz-fullbleed');
    };
  }, []);

  // If the URL aid changes (e.g. user navigates from another deep-link
  // CTA), re-select. Local picks win until the URL aid changes again.
  useEffect(() => {
    if (urlAid) setSelectedAid(urlAid);
  }, [urlAid]);

  const effectiveAid = selectedAid ?? data?.defaultAid ?? '';
  const selectedSku = useMemo(
    () => data?.skus.find((s) => s.aid === effectiveAid) ?? null,
    [data, effectiveAid],
  );
  // Phase 2 acceptance: when ?aid= points at an unknown SKU we must NOT
  // navigate away — render an explicit "SKU not found" banner instead.
  const requestedSkuMissing = Boolean(
    urlAid && data && !data.skus.some((s) => s.aid === urlAid),
  );

  const heroView: HeroView | null = useMemo(() => {
    if (!data) return null;
    if (effectiveAid === data.defaultAid) {
      const h = data.workbench.hero;
      return {
        eyebrow: h.eyebrow,
        title: h.title,
        sub: h.sub,
        chips: h.chips,
        meta: h.meta,
        currentPrice: h.currentPrice,
        currentMargin: h.currentMargin,
        currentMarginTone: h.currentMarginTone,
        targetText: h.targetText,
      };
    }
    if (selectedSku?.shortHero) {
      return {
        eyebrow: data.workbench.hero.eyebrow,
        title: selectedSku.shortHero.title,
        sub: selectedSku.shortHero.sub,
        chips: [
          { label: selectedSku.shortHero.chipCluster },
          { label: selectedSku.locked ? 'Locked' : 'Movable', variant: 'movable' },
          { label: 'A/B status: not yet tested', variant: 'dashed' },
          { label: selectedSku.shortHero.chipApproval },
        ],
        meta: selectedSku.shortHero.meta,
        currentPrice: selectedSku.shortHero.currentPrice,
        currentMargin: selectedSku.shortHero.currentMargin,
        currentMarginTone: selectedSku.shortHero.currentMarginTone,
        targetText: selectedSku.shortHero.targetText,
      };
    }
    return {
      eyebrow: data.workbench.hero.eyebrow,
      title: `Article ${effectiveAid}`,
      sub: 'No detailed workbench data — showing default model.',
      chips: data.workbench.hero.chips,
      meta: data.workbench.hero.meta,
      currentPrice: data.workbench.hero.currentPrice,
      currentMargin: data.workbench.hero.currentMargin,
      currentMarginTone: data.workbench.hero.currentMarginTone,
      targetText: data.workbench.hero.targetText,
    };
  }, [data, effectiveAid, selectedSku]);

  if (isLoading || !data || !heroView) {
    return <StudioSkeleton />;
  }

  const showComparable = selectedSku?.isNew ?? false;
  const wb = selectedSku?.workbench ?? data.workbench;
  const fanPrice = activeOption?.price ?? wb.fanout.fanPrice;

  // Phase 1 — derive a numeric current price for Δ calculations. The
  // existing heroView.currentPrice is a pre-formatted string ("€118.00").
  // We strip non-digits + parse so the new tiles can compute one delta
  // without forcing the BFF to ship a parallel numeric field.
  const currentPriceValue = (() => {
    const cleaned = (heroView.currentPrice ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.');
    const n = parseDecimal(cleaned);
    return Number.isFinite(n) ? n : undefined;
  })();
  // Pre-formatted current margin (string) — used as the "Projected DB2 at
  // current" subtitle on the KPI tiles. Real projected-DB2 at recommended
  // ships in Phase 3 with option_margin.
  const deepLinkSource = params.get('source');

  return (
    <LineageDrawerProvider>
      <section id="screen-studio" className="w-full px-6 py-6">
        <PageHead header={data.header} />
        <DeepLinkBanner effectiveAid={effectiveAid} skuFound={!requestedSkuMissing} />

        <div className="ws-grid">
          <SkuPicker
            skus={data.skus}
            filters={data.filters}
            toggles={data.toggles}
            selectedAid={effectiveAid}
            onSelect={handleSelectSku}
          />

          <div className="ws-bench">
            <WorkbenchHero hero={heroView} />

            {/* Phase 1 — Recommendation hero card replaces the top-of-page
                price options. Reads typed BFF blocks; PriceOptions is
                demoted to a compact alternatives row below. */}
            <RecommendationHero
              aid={effectiveAid}
              recommendation={wb.recommendation}
              wtp={wb.wtp}
              winProbCurve={wb.win_prob_curve}
              competitorRef={wb.competitor_ref}
              currentPriceLabel={heroView.currentPrice}
              currentPriceValue={currentPriceValue}
              lastTickAt={live.lastTickAt}
              source={deepLinkSource}
            />

            <RecommendationKpiTiles
              aid={effectiveAid}
              recommendation={wb.recommendation}
              winProbCurve={wb.win_prob_curve}
              wtp={wb.wtp}
              currentPriceLabel={heroView.currentPrice}
              currentPriceValue={currentPriceValue}
              currentMarginLabel={heroView.currentMargin}
              // Phase 3 will wire projectedDb2Label from wb.option_margin.
            />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <WinProbCurve
                curve={wb.win_prob_curve}
                recommendedPrice={wb.recommendation?.recommended_price}
              />
              <DriverWaterfall
                drivers={wb.recommendation?.drivers}
                emphasiseFloor={deepLinkSource === 'margin'}
              />
            </div>

            <WtpBandStrip
              wtp={wb.wtp}
              recommendedPrice={wb.recommendation?.recommended_price}
              floor={wb.recommendation?.band.min}
              className="mt-3"
            />

            <PriceOptions
              options={wb.options}
              optionsSub={wb.optionsSub}
              onActiveChange={setActiveOption}
              compact
            />

            <div className="ws-body">
              <CustomerFanout data={wb.fanout} fanPrice={fanPrice} />
              <CostHistory cost={wb.cost} history={wb.history} />
            </div>

            {showComparable && <ComparablePanel data={data.comparable} />}

            <ProposalContextPanel
              articleId={effectiveAid}
              recommendationId={params.get('recommendation')}
            />

            <DecisionFooter
              data={wb.decision}
              activeOption={activeOption}
              currentPriceLabel={heroView.currentPrice}
            />

            <RationaleMemo data={wb.memo} />
          </div>
        </div>

        <CrossLinks links={data.crossLinks} />
        <LineageDrawer aid={effectiveAid} />
      </section>
    </LineageDrawerProvider>
  );
}
