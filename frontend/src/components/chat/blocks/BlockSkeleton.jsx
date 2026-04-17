export default function BlockSkeleton({ kind }) {
  const shimmer = 'animate-pulse bg-slate-100 rounded';
  switch (kind) {
    case 'narrative':
      return (
        <div className="space-y-2 my-2">
          <div className={`${shimmer} h-3 w-11/12`} />
          <div className={`${shimmer} h-3 w-9/12`} />
        </div>
      );
    case 'metric_tile':
      return <div className={`${shimmer} h-16 w-48 my-2`} />;
    case 'metric_grid':
      return (
        <div className="grid grid-cols-2 gap-3 my-2">
          <div className={`${shimmer} h-16`} /><div className={`${shimmer} h-16`} />
          <div className={`${shimmer} h-16`} /><div className={`${shimmer} h-16`} />
        </div>
      );
    case 'comparison_cards':
      return (
        <div className="grid grid-cols-2 gap-3 my-3">
          <div className={`${shimmer} h-40`} /><div className={`${shimmer} h-40`} />
        </div>
      );
    case 'ranked_list':
      return (
        <div className="space-y-2 my-3">
          {[0,1,2,3].map(i => <div key={i} className={`${shimmer} h-10`} />)}
        </div>
      );
    case 'factor_breakdown':
      return (
        <div className="space-y-2 my-3">
          {[0,1,2].map(i => <div key={i} className={`${shimmer} h-8`} />)}
        </div>
      );
    case 'chart':
      return <div className={`${shimmer} h-48 my-3`} />;
    case 'callout':
      return <div className={`${shimmer} h-10 my-2`} />;
    case 'action_plan':
      return (
        <div className="space-y-2 my-3">
          {[0,1].map(i => <div key={i} className={`${shimmer} h-16`} />)}
        </div>
      );
    case 'data_table':
      return <div className={`${shimmer} h-32 my-3`} />;
    case 'clarification':
      return <div className={`${shimmer} h-16 my-2`} />;
    default:
      return <div className={`${shimmer} h-10 my-2`} />;
  }
}
