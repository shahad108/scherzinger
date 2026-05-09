import { useForecast } from '@/data/api/useForecast';
import { PageHead } from './components/PageHead';
import { HeroForecast } from './components/HeroForecast';

export default function ForecastingPage() {
  const { data, isLoading } = useForecast();

  if (isLoading || !data) {
    return <section id="screen-forecast" aria-busy="true" />;
  }

  return (
    <section id="screen-forecast" className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHead header={data.header} />
      <HeroForecast hero={data.hero} />
    </section>
  );
}
