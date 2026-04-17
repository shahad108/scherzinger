import MetricTile from './MetricTile';

export default function MetricGrid({ spec }) {
  const n = spec.tiles.length;
  const cols = n >= 4 ? 'grid-cols-2 md:grid-cols-4' : n === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${cols} gap-3 my-3`}>
      {spec.tiles.map((t, i) => <MetricTile key={i} spec={t} />)}
    </div>
  );
}
