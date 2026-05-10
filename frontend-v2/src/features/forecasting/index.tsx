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

export default function ForecastingPage() {
  const { data, isLoading } = useForecast();

  if (isLoading || !data) {
    return <ForecastSkeleton />;
  }

  return (
    <section id="screen-forecast" className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHead header={data.header} />
      <HeroForecast hero={data.hero} />
      <ClusterLens clusters={data.clusters} />
      <WalkForward panel={data.walkForward} />
      <InputCostTrajectory data={data.inputCost} />
      <ParetoLayer data={data.pareto} />
      <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} />
      <NewProductForecast data={data.newProduct} />
      <CrossLinkStrip />
    </section>
  );
}
