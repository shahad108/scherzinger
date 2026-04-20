import MetricTile from './MetricTile';

export default function MetricGrid({ spec, compact = false }) {
  const n = spec.tiles.length;
  const cols = compact
    ? 'grid-cols-2'
    : (n >= 4 ? 'grid-cols-2 md:grid-cols-4' : n === 3 ? 'grid-cols-3' : 'grid-cols-2');
  const gap = compact ? 'gap-2' : 'gap-3';
  return (
    <div className={`grid ${cols} ${gap} my-2`}>
      {spec.tiles.map((t, i) => <MetricTile key={i} spec={t} compact={compact} />)}
    </div>
  );
}
