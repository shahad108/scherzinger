export default function BlockSkeleton({ kind, compact = false }) {
  const shimmer = 'animate-pulse bg-slate-100 rounded';
  switch (kind) {
    case 'narrative':
      return (
        <div className="space-y-1.5 my-1.5">
          <div className={`${shimmer} h-2.5 w-11/12`} />
          <div className={`${shimmer} h-2.5 w-9/12`} />
        </div>
      );
    case 'metric_tile':
      return <div className={`${shimmer} ${compact ? 'h-10 w-32' : 'h-16 w-48'} my-1.5`} />;
    case 'metric_grid':
      return (
        <div className={`grid grid-cols-2 ${compact ? 'gap-2' : 'gap-3'} my-2`}>
          {[0,1,2,3].map(i => <div key={i} className={`${shimmer} ${compact ? 'h-10' : 'h-16'}`} />)}
        </div>
      );
    case 'comparison_cards':
      return compact
        ? <div className={`${shimmer} h-20 my-2`} />
        : (
          <div className="grid grid-cols-2 gap-3 my-3">
            <div className={`${shimmer} h-40`} /><div className={`${shimmer} h-40`} />
          </div>
        );
    case 'ranked_list':
      return (
        <div className="space-y-1.5 my-2">
          {(compact ? [0,1,2] : [0,1,2,3]).map(i => <div key={i} className={`${shimmer} ${compact ? 'h-6' : 'h-10'}`} />)}
        </div>
      );
    case 'factor_breakdown':
      return (
        <div className="space-y-1.5 my-2">
          {[0,1,2].map(i => <div key={i} className={`${shimmer} ${compact ? 'h-5' : 'h-8'}`} />)}
        </div>
      );
    case 'chart':
      return <div className={`${shimmer} ${compact ? 'h-20' : 'h-48'} my-2`} />;
    case 'callout':
      return <div className={`${shimmer} ${compact ? 'h-8' : 'h-10'} my-1.5`} />;
    case 'action_plan':
      return (
        <div className="space-y-2 my-3">
          {[0,1].map(i => <div key={i} className={`${shimmer} h-16`} />)}
        </div>
      );
    case 'data_table':
      return <div className={`${shimmer} ${compact ? 'h-16' : 'h-32'} my-2`} />;
    case 'clarification':
      return <div className={`${shimmer} h-14 my-2`} />;
    default:
      return <div className={`${shimmer} h-10 my-2`} />;
  }
}
