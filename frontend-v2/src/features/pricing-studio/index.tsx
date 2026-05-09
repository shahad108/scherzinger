import { useMemo, useState } from 'react';
import { useStudio } from '@/data/api/useStudio';
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

export default function PricingStudioPage() {
  const { data, isLoading } = useStudio();
  const [selectedAid, setSelectedAid] = useState<string | null>(null);
  const [activeOption, setActiveOption] = useState<ActiveOptionView | null>(null);

  const effectiveAid = selectedAid ?? data?.defaultAid ?? '';
  const selectedSku = useMemo(
    () => data?.skus.find((s) => s.aid === effectiveAid) ?? null,
    [data, effectiveAid],
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
    return <section id="screen-studio" aria-busy="true" />;
  }

  const showComparable = selectedSku?.isNew ?? false;
  const wb = data.workbench;
  const fanPrice = activeOption?.price ?? wb.fanout.fanPrice;

  return (
    <section id="screen-studio" className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHead header={data.header} />

      <div className="ws-grid">
        <SkuPicker
          skus={data.skus}
          filters={data.filters}
          toggles={data.toggles}
          selectedAid={effectiveAid}
          onSelect={setSelectedAid}
        />

        <div className="ws-bench">
          <WorkbenchHero hero={heroView} />

          <PriceOptions
            options={wb.options}
            optionsSub={wb.optionsSub}
            clusterMeta="cluster-confidence"
            onActiveChange={setActiveOption}
          />

          <div className="ws-body">
            <CustomerFanout data={wb.fanout} fanPrice={fanPrice} />
            <CostHistory cost={wb.cost} history={wb.history} />
          </div>

          {showComparable && <ComparablePanel data={data.comparable} />}

          <DecisionFooter data={wb.decision} activeOption={activeOption} />

          <RationaleMemo data={wb.memo} />
        </div>
      </div>

      <CrossLinks links={data.crossLinks} />
    </section>
  );
}
