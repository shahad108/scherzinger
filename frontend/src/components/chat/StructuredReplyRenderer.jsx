import { validateBlock } from '../../utils/structuredReply/schema';
import BlockSkeleton from './blocks/BlockSkeleton';
import Narrative from './blocks/Narrative';
import MetricTile from './blocks/MetricTile';
import MetricGrid from './blocks/MetricGrid';
import ComparisonCards from './blocks/ComparisonCards';
import RankedList from './blocks/RankedList';
import FactorBreakdown from './blocks/FactorBreakdown';
import Chart from './blocks/Chart';
import Callout from './blocks/Callout';
import ActionPlan from './blocks/ActionPlan';
import DataTable from './blocks/DataTable';
import Clarification from './blocks/Clarification';
import ReportDownload from './blocks/ReportDownload';

const COMPONENTS = {
  narrative: Narrative,
  metric_tile: MetricTile,
  metric_grid: MetricGrid,
  comparison_cards: ComparisonCards,
  ranked_list: RankedList,
  factor_breakdown: FactorBreakdown,
  chart: Chart,
  callout: Callout,
  action_plan: ActionPlan,
  data_table: DataTable,
  clarification: Clarification,
  report_download: ReportDownload,
};

// Blocks that do not render in compact mode (reachable only via "View detailed").
const HIDDEN_IN_COMPACT = new Set(['action_plan', 'report_download']);

function BlockError({ reason }) {
  return (
    <div className="my-2 text-xs text-red-700 bg-red-50 ring-1 ring-red-200 rounded px-3 py-2">
      Couldn't render this block: {reason}
    </div>
  );
}

export default function StructuredReplyRenderer({
  blocks = [],
  status = [],
  onEntityClick,
  finalized = false,
  conversationMessages = [],
  compact = false,
}) {
  return (
    <div className="space-y-0">
      {blocks.map((spec, i) => {
        if (compact && HIDDEN_IN_COMPACT.has(spec?.type)) return null;
        const s = status[i] || (finalized ? 'ready' : 'pending');
        if (s === 'pending') {
          return <BlockSkeleton key={i} kind={spec?.type || 'narrative'} compact={compact} />;
        }
        const v = validateBlock(spec);
        if (!v.ok) return <BlockError key={i} reason={v.reason} />;
        const Cmp = COMPONENTS[spec.type];
        if (spec.type === 'report_download') {
          return (
            <Cmp
              key={i}
              spec={spec}
              messageBlocks={blocks}
              conversationMessages={conversationMessages}
              compact={compact}
            />
          );
        }
        return <Cmp key={i} spec={spec} onEntityClick={onEntityClick} compact={compact} />;
      })}
    </div>
  );
}
