# Mini-Chat Compact Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render structured chat blocks in a compact variant inside `GlobalChatBar` so the mini-chat drawer stops overflowing while AI Insights keeps the full layout.

**Architecture:** Thread a new `compact: boolean` prop from `GlobalChatBar` → `StructuredReplyRenderer` → each block component. Renderer skip-list hides `action_plan` and `report_download` entirely when compact. Other blocks have a small `compact` branch tightening layout (2-col grids, 80px sparkline charts, donut → top-3 text list, flat factor rows, truncated long lists).

**Tech Stack:** React 19, Tailwind 4, recharts (unchanged), vitest. No new dependencies.

**Reference files (read before starting):**
- `docs/superpowers/specs/2026-04-17-mini-chat-compact-rendering-design.md` — the spec
- `frontend/src/components/chat/StructuredReplyRenderer.jsx` — current dispatcher
- `frontend/src/components/GlobalChatBar.jsx` — the consumer that opts in
- `frontend/src/components/chat/blocks/*.jsx` — the 13 block components

All work stays on branch `demo-phase45`. Deploy target after all tasks complete: Avanna EC2 demo (`~/pryzm/frontend/dist-demo/`) via rsync — final task.

---

## Task 1: Renderer `compact` prop + skip-list (TDD)

**Files:**
- Modify: `frontend/src/components/chat/StructuredReplyRenderer.jsx`
- Create: `frontend/src/components/chat/__tests__/StructuredReplyRenderer.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/chat/__tests__/StructuredReplyRenderer.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import StructuredReplyRenderer from '../StructuredReplyRenderer';

describe('StructuredReplyRenderer (compact)', () => {
  it('renders narrative in full mode', () => {
    const { container } = render(
      <StructuredReplyRenderer
        blocks={[{ type: 'narrative', text: 'hello world' }]}
        finalized
      />
    );
    expect(container.textContent).toContain('hello world');
  });

  it('renders narrative in compact mode', () => {
    const { container } = render(
      <StructuredReplyRenderer
        blocks={[{ type: 'narrative', text: 'hello world' }]}
        finalized
        compact
      />
    );
    expect(container.textContent).toContain('hello world');
  });

  it('hides action_plan in compact mode', () => {
    const blocks = [
      { type: 'narrative', text: 'before' },
      { type: 'action_plan', actions: [{ title: 'Do a thing', priority: 'high' }] },
      { type: 'narrative', text: 'after' },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized compact />
    );
    expect(container.textContent).toContain('before');
    expect(container.textContent).toContain('after');
    expect(container.textContent).not.toContain('Do a thing');
    expect(container.textContent).not.toContain('HIGH');
  });

  it('renders action_plan in full mode', () => {
    const blocks = [
      { type: 'action_plan', actions: [{ title: 'Do a thing', priority: 'high' }] },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized />
    );
    expect(container.textContent).toContain('Do a thing');
  });

  it('hides report_download in compact mode', () => {
    const blocks = [
      { type: 'narrative', text: 'lead' },
      { type: 'report_download', title: 'Weekly Report', scope: 'reply', defaultFormat: 'pdf' },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized compact />
    );
    expect(container.textContent).toContain('lead');
    expect(container.textContent).not.toContain('Weekly Report');
  });

  it('renders report_download in full mode', () => {
    const blocks = [
      { type: 'report_download', title: 'Weekly Report', scope: 'reply', defaultFormat: 'pdf' },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized />
    );
    expect(container.textContent).toContain('Weekly Report');
  });
});
```

- [ ] **Step 2: Run tests — expect failures (compact prop not implemented yet)**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npm test -- StructuredReplyRenderer
```

Expected: the 3 compact tests fail (action_plan / report_download are still rendered even when compact={true}).

- [ ] **Step 3: Implement in renderer**

Replace the entire contents of `frontend/src/components/chat/StructuredReplyRenderer.jsx` with:

```jsx
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
```

- [ ] **Step 4: Run — tests pass**

```bash
npm test -- StructuredReplyRenderer
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: 49 existing + 6 new = 55 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/StructuredReplyRenderer.jsx frontend/src/components/chat/__tests__/StructuredReplyRenderer.test.jsx
git commit -m "mini-chat-compact: renderer compact prop + skip-list for action_plan/report_download"
```

---

## Task 2: `GlobalChatBar` opts into compact

**Files:**
- Modify: `frontend/src/components/GlobalChatBar.jsx`

- [ ] **Step 1: Add `compact={true}` on the renderer usage**

Find the existing `<StructuredReplyRenderer ... />` usage in `frontend/src/components/GlobalChatBar.jsx` (currently passes `blocks`, `status`, `finalized`, `onEntityClick`, `conversationMessages`). Add `compact={true}`. Result should be:

```jsx
<StructuredReplyRenderer
  blocks={msg.blocks || []}
  status={msg.status || []}
  finalized={!!msg.finalized}
  onEntityClick={handleEntityClick}
  conversationMessages={messages}
  compact={true}
/>
```

Preserve existing indentation.

- [ ] **Step 2: Tests + build**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GlobalChatBar.jsx
git commit -m "mini-chat-compact: GlobalChatBar renders in compact mode"
```

---

## Task 3: Pattern A — Narrative + Callout + Clarification compact text

**Files:**
- Modify: `frontend/src/components/chat/blocks/Narrative.jsx`
- Modify: `frontend/src/components/chat/blocks/Callout.jsx`
- Modify: `frontend/src/components/chat/blocks/Clarification.jsx`

- [ ] **Step 1: Replace Narrative.jsx**

Replace the entire contents with:

```jsx
import { TONE_RING } from './formatters';

export default function Narrative({ spec, compact = false }) {
  const { text, tone } = spec;
  const textCls = compact ? 'text-xs leading-snug' : 'text-sm leading-relaxed';
  if (!tone || tone === 'neutral') {
    return <p className={`${textCls} text-slate-700 my-1.5`}>{text}</p>;
  }
  return (
    <div className={`${textCls} ring-1 rounded-lg px-3 py-2 my-1.5 ${TONE_RING[tone] || TONE_RING.neutral}`}>
      {text}
    </div>
  );
}
```

- [ ] **Step 2: Replace Callout.jsx**

Replace the entire contents with:

```jsx
import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TONE_RING } from './formatters';

const ICON = { insight: Info, warning: AlertTriangle, success: CheckCircle2 };

export default function Callout({ spec, compact = false }) {
  const Icon = ICON[spec.tone] || Info;
  const textCls = compact ? 'text-xs' : 'text-sm';
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className={`flex items-start gap-2 ${textCls} ring-1 rounded-lg px-3 py-2 my-1.5 ${TONE_RING[spec.tone] || TONE_RING.insight}`}>
      <Icon className={`${iconSize} mt-0.5 shrink-0`} />
      <span className="leading-relaxed">{spec.text}</span>
    </div>
  );
}
```

- [ ] **Step 3: Replace Clarification.jsx**

Replace the entire contents with:

```jsx
import { useChat } from '../../../context/ChatContext';

export default function Clarification({ spec, compact = false }) {
  const { sendMessage } = useChat();
  const titleCls = compact ? 'text-xs' : 'text-sm';
  const chipCls = compact ? 'text-[11px] px-2.5 py-1' : 'text-xs px-3 py-1.5';
  return (
    <div className={`my-3 rounded-xl ring-1 ring-blue-200 bg-blue-50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`${titleCls} font-medium text-blue-900`}>{spec.question}</div>
      {Array.isArray(spec.suggestions) && spec.suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {spec.suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => sendMessage(s)}
              className={`${chipCls} rounded-full bg-white ring-1 ring-blue-200 text-blue-800 hover:bg-blue-100`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/blocks/Narrative.jsx frontend/src/components/chat/blocks/Callout.jsx frontend/src/components/chat/blocks/Clarification.jsx
git commit -m "mini-chat-compact: Narrative + Callout + Clarification compact text sizes"
```

---

## Task 4: MetricTile + MetricGrid compact (2-col grid, no caption)

**Files:**
- Modify: `frontend/src/components/chat/blocks/MetricTile.jsx`
- Modify: `frontend/src/components/chat/blocks/MetricGrid.jsx`

- [ ] **Step 1: Replace MetricTile.jsx**

Replace the entire contents with:

```jsx
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const DIR_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };
const DIR_COLOR = { up: 'text-emerald-600', down: 'text-red-600', flat: 'text-slate-400' };

export default function MetricTile({ spec, compact = false }) {
  const { label, value, unit, delta, deltaDirection, caption } = spec;
  const Icon = DIR_ICON[deltaDirection] || null;
  const pad = compact ? 'px-3 py-2' : 'px-4 py-3';
  const valueCls = compact ? 'text-base font-bold text-slate-900' : 'text-2xl font-bold text-slate-900';
  const labelCls = compact
    ? 'text-[10px] font-medium text-slate-500 uppercase tracking-wide'
    : 'text-xs font-medium text-slate-500 uppercase tracking-wide';
  const unitCls = compact ? 'text-[11px] text-slate-500' : 'text-sm text-slate-500';
  return (
    <div className={`rounded-xl ring-1 ring-slate-200 bg-white ${pad} my-1.5`}>
      <div className={labelCls}>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <div className={valueCls}>{value}</div>
        {unit && <div className={unitCls}>{unit}</div>}
      </div>
      {delta != null && (
        <div className={`mt-0.5 flex items-center gap-1 text-[11px] ${DIR_COLOR[deltaDirection] || 'text-slate-600'}`}>
          {Icon && <Icon className="w-3 h-3" />}
          <span>{delta}</span>
        </div>
      )}
      {!compact && caption && <div className="mt-2 text-xs text-slate-500 leading-relaxed">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Replace MetricGrid.jsx**

Replace the entire contents with:

```jsx
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
```

- [ ] **Step 3: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/blocks/MetricTile.jsx frontend/src/components/chat/blocks/MetricGrid.jsx
git commit -m "mini-chat-compact: MetricTile smaller value, MetricGrid forced 2-col"
```

---

## Task 5: DataTable compact (3 rows + "+N more")

**Files:**
- Modify: `frontend/src/components/chat/blocks/DataTable.jsx`

- [ ] **Step 1: Replace DataTable.jsx**

Replace the entire contents with:

```jsx
import { formatValue } from './formatters';

const COMPACT_ROW_LIMIT = 3;

export default function DataTable({ spec, compact = false }) {
  const { columns, rows, caption } = spec;
  const visibleRows = compact ? rows.slice(0, COMPACT_ROW_LIMIT) : rows;
  const overflowCount = compact ? Math.max(0, rows.length - visibleRows.length) : 0;
  const textCls = compact ? 'text-[11px]' : 'text-xs';
  return (
    <div className="my-2">
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
        <table className={`w-full ${textCls}`}>
          <thead className="bg-slate-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr key={ri} className="border-t border-slate-100 hover:bg-slate-50/50">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                    {formatValue(row[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflowCount > 0 && (
        <div className="mt-1 text-[11px] text-slate-500 italic">+{overflowCount} row{overflowCount === 1 ? '' : 's'} in detailed view</div>
      )}
      {!compact && caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/DataTable.jsx
git commit -m "mini-chat-compact: DataTable limited to 3 rows with overflow footer"
```

---

## Task 6: RankedList compact (top 5, hide metric label)

**Files:**
- Modify: `frontend/src/components/chat/blocks/RankedList.jsx`

- [ ] **Step 1: Replace RankedList.jsx**

Replace the entire contents with:

```jsx
import { formatValue } from './formatters';
import EntityChip from './EntityChip';

const BADGE_CLS = {
  critical: 'bg-red-100 text-red-800 ring-red-200',
  warning:  'bg-amber-100 text-amber-800 ring-amber-200',
  success:  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  neutral:  'bg-slate-100 text-slate-700 ring-slate-200',
};

const COMPACT_ITEM_LIMIT = 5;

export default function RankedList({ spec, onEntityClick, compact = false }) {
  const { items, caption } = spec;
  const visible = compact ? items.slice(0, COMPACT_ITEM_LIMIT) : items;
  const overflowCount = compact ? Math.max(0, items.length - visible.length) : 0;
  const rowPad = compact ? 'px-3 py-1.5' : 'px-4 py-2.5';
  const textCls = compact ? 'text-[11px]' : 'text-sm';
  return (
    <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ol>
        {visible.map((it, i) => (
          <li key={it.id} className={`flex items-center gap-2 ${rowPad} border-t border-slate-100 first:border-t-0`}>
            <span className="text-[11px] font-mono text-slate-400 w-4 shrink-0">{i + 1}</span>
            <span className={`flex-1 min-w-0 truncate ${textCls}`}>
              <EntityChip {...it} onEntityClick={onEntityClick} />
            </span>
            {!compact && <span className="text-xs text-slate-500">{it.primary.label}</span>}
            <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-900 tabular-nums`}>
              {formatValue(it.primary.value, it.primary.format)}
            </span>
            {it.badge && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${BADGE_CLS[it.badge.tone] || BADGE_CLS.neutral}`}>
                {it.badge.text}
              </span>
            )}
          </li>
        ))}
      </ol>
      {overflowCount > 0 && (
        <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500 italic border-t border-slate-100">
          +{overflowCount} more in detailed view
        </div>
      )}
      {!compact && caption && <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/RankedList.jsx
git commit -m "mini-chat-compact: RankedList top-5 + truncation footer + hide metric label"
```

---

## Task 7: FactorBreakdown compact (flat rows, no expand, no detail)

**Files:**
- Modify: `frontend/src/components/chat/blocks/FactorBreakdown.jsx`

- [ ] **Step 1: Replace FactorBreakdown.jsx**

Replace the entire contents with:

```jsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import renderMarkdown from '../../../utils/markdownRenderer';
import { STATUS_DOT, STATUS_LABEL } from './formatters';

export default function FactorBreakdown({ spec, compact = false }) {
  const [open, setOpen] = useState({});
  if (compact) {
    return (
      <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <ul>
          {spec.factors.map((f, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-1.5 border-t border-slate-100 first:border-t-0">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[f.status] || 'bg-slate-300'}`} />
              <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-slate-800">{f.label}</span>
              {f.weight != null && (
                <span className="text-[10px] text-slate-500 tabular-nums">{(f.weight * 100).toFixed(0)}%</span>
              )}
              <span className="text-[10px] text-slate-500">{STATUS_LABEL[f.status]}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ul>
        {spec.factors.map((f, i) => {
          const canExpand = !!f.detail;
          const isOpen = !!open[i];
          return (
            <li key={i} className="border-t border-slate-100 first:border-t-0">
              <button
                type="button"
                disabled={!canExpand}
                onClick={() => canExpand && setOpen(o => ({ ...o, [i]: !o[i] }))}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${canExpand ? 'hover:bg-slate-50' : ''}`}
              >
                {canExpand ? (
                  isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
                ) : <span className="w-4" />}
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[f.status] || 'bg-slate-300'}`} />
                <span className="flex-1 text-sm font-medium text-slate-800">{f.label}</span>
                {f.weight != null && (
                  <span className="text-xs text-slate-500 tabular-nums">{(f.weight * 100).toFixed(1)}%</span>
                )}
                {f.value && <span className="text-xs text-slate-600">{f.value}</span>}
                <span className="text-xs text-slate-500">{STATUS_LABEL[f.status]}</span>
              </button>
              {canExpand && isOpen && (
                <div className="px-11 pb-3 pr-4 text-xs text-slate-600 leading-relaxed">
                  {renderMarkdown(f.detail)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {spec.caption && (
        <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{spec.caption}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/FactorBreakdown.jsx
git commit -m "mini-chat-compact: FactorBreakdown flat rows in compact (no expand)"
```

---

## Task 8: ComparisonCards compact (single vertical table)

**Files:**
- Modify: `frontend/src/components/chat/blocks/ComparisonCards.jsx`

- [ ] **Step 1: Replace ComparisonCards.jsx**

Replace the entire contents with:

```jsx
import { formatValue } from './formatters';
import EntityChip from './EntityChip';

export default function ComparisonCards({ spec, onEntityClick, compact = false }) {
  const { subjects, metrics, caption } = spec;

  if (compact) {
    return (
      <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Metric</th>
              {subjects.map(s => (
                <th key={s.id} className="text-right px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">
                  <EntityChip {...s} onEntityClick={onEntityClick} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-500">{m.label}</td>
                {m.values.map((v, si) => (
                  <td key={si} className="px-3 py-1.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    {formatValue(v, m.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const cols = subjects.length >= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
  return (
    <div className="my-3">
      <div className={`grid ${cols} gap-3`}>
        {subjects.map((s, si) => (
          <div key={s.id} className="rounded-xl ring-1 ring-slate-200 bg-white p-4">
            <div className="text-sm mb-3">
              <EntityChip {...s} onEntityClick={onEntityClick} />
            </div>
            <dl className="space-y-2">
              {metrics.map(m => (
                <div key={m.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-slate-500">{m.label}</dt>
                  <dd className="text-sm font-semibold text-slate-900">{formatValue(m.values[si], m.format)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/ComparisonCards.jsx
git commit -m "mini-chat-compact: ComparisonCards switches to single vertical table"
```

---

## Task 9: Chart compact (sparkline for line/bar; top-3 list for donut)

**Files:**
- Modify: `frontend/src/components/chat/blocks/Chart.jsx`

- [ ] **Step 1: Replace Chart.jsx**

Replace the entire contents with:

```jsx
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

function toRows(series) {
  if (!series || series.length === 0) return [];
  const firstData = series[0].data || [];
  return firstData.map((d, i) => {
    const x = (d && typeof d === 'object' && 'x' in d) ? d.x : i;
    const row = { x };
    series.forEach(s => {
      const point = (s.data || [])[i];
      const y = (point && typeof point === 'object') ? point.y : point;
      row[s.name] = y;
    });
    return row;
  });
}

function CompactDonutList({ spec }) {
  const data = (spec.series?.[0]?.data || []).map((d, i) => ({
    name: (d && d.x) ?? `Slice ${i+1}`,
    value: Number((d && d.y) ?? d) || 0,
  }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const top3 = [...data].sort((a, b) => b.value - a.value).slice(0, 3);
  return (
    <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white p-3">
      {spec.title && <div className="text-[11px] font-semibold text-slate-800 mb-1.5">{spec.title}</div>}
      <ul className="space-y-1">
        {top3.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 min-w-0 truncate text-slate-700">{d.name}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Chart({ spec, compact = false }) {
  const { variant, title, series = [], xLabel, yLabel, caption } = spec;

  if (compact && variant === 'donut') return <CompactDonutList spec={spec} />;

  const height = compact ? 80 : 224;
  const showAxes = !compact;
  const showLegend = !compact;
  const wrapperPad = compact ? 'p-2' : 'p-4';
  const titleCls = compact ? 'text-[11px] font-semibold text-slate-800 mb-1' : 'text-sm font-semibold text-slate-800 mb-2';

  return (
    <div className={`my-2 rounded-xl ring-1 ring-slate-200 bg-white ${wrapperPad}`}>
      {title && <div className={titleCls}>{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === 'donut' ? (
            <PieChart>
              <Pie
                data={(series[0]?.data || []).map((d, i) => ({
                  name: (d && d.x) ?? `Slice ${i+1}`,
                  value: (d && d.y) ?? d,
                }))}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {(series[0]?.data || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : variant === 'bar' ? (
            <BarChart data={toRows(series)}>
              {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              {showAxes && <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />}
              {showAxes && <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />}
              <Tooltip />
              {showLegend && <Legend />}
              {series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} />)}
            </BarChart>
          ) : (
            <LineChart data={toRows(series)}>
              {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              {showAxes && <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />}
              {showAxes && <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />}
              <Tooltip />
              {showLegend && <Legend />}
              {series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {!compact && caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/Chart.jsx
git commit -m "mini-chat-compact: Chart sparkline (80px) + donut→top3 list in compact"
```

---

## Task 10: BlockSkeleton compact heights

**Files:**
- Modify: `frontend/src/components/chat/blocks/BlockSkeleton.jsx`

- [ ] **Step 1: Replace BlockSkeleton.jsx**

Replace the entire contents with:

```jsx
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
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: 55 tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/BlockSkeleton.jsx
git commit -m "mini-chat-compact: BlockSkeleton compact heights match compact block layouts"
```

---

## Task 11: Local visual verification

Local-only — no deploy. User opens the mini-chat and verifies no overflow.

- [ ] **Step 1: Start dev server**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npm run dev
```

- [ ] **Step 2: Open the app**

Navigate to `http://localhost:5173/`. Log in (or seed a session).

Open the mini-chat drawer and ask:

- *"Give me a full Q1 health check: revenue, margin, win rate, top 5 at-risk customers, and what I should do next week."*

Expect:
- Narrative, metric grid (2-col), chart (80px), ranked list (top 5, no overflow), factor breakdown (flat rows).
- **No** action plan card. **No** download card.
- No horizontal overflow. No value clipped.

- [ ] **Step 3: Click "View detailed" on the same message**

Expect: AI Insights full-page shows the same answer with action plan and any download card visible, dense layout.

- [ ] **Step 4: Verify `/chat-debug` unchanged**

Navigate to `http://localhost:5173/chat-debug`. Dropdown through every fixture. Visual should match what you saw before Task 1 — `compact` prop defaults to `false`, so nothing here should look different.

- [ ] **Step 5: Stop dev server (Ctrl-C)**

No commit — this is a verification step. If anything looks wrong, fix the offending component and commit separately before moving on.

---

## Task 12: Build, verify INR clean, deploy to demo, live QA

Follow the pinned demo-deploy procedure. **Do not** push to the real Scherzinger server.

- [ ] **Step 1: Build demo bundle**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend
rm -rf dist dist-demo
npm run build -- --base=/demo/
mv dist dist-demo
```

Expected: clean build. Bundle sizes roughly unchanged (compact rendering is render-only; no new chunks).

- [ ] **Step 2: Verify real build clean**

```bash
./scripts/verify-real-build.sh
```

Expected: `✅ Real build clean (no phase 4/5 artifacts found). Bundle hash: <hex>`.

If it fails, STOP.

- [ ] **Step 3: Backup existing demo bundle**

```bash
ssh -i /Users/dharmendersingh/Documents/Scherzinger_new/pryzm_avana_demo.pem ec2-user@3.76.141.43 \
  "cd ~/pryzm/frontend && cp -r dist-demo dist-demo.bak.$(date +%s)"
```

- [ ] **Step 4: Rsync**

```bash
rsync -avz --delete \
  -e "ssh -i /Users/dharmendersingh/Documents/Scherzinger_new/pryzm_avana_demo.pem" \
  dist-demo/ \
  ec2-user@3.76.141.43:~/pryzm/frontend/dist-demo/
```

- [ ] **Step 5: Verify INR build byte-identical**

```bash
ssh -i /Users/dharmendersingh/Documents/Scherzinger_new/pryzm_avana_demo.pem ec2-user@3.76.141.43 \
  "md5sum ~/pryzm/frontend/dist/assets/*.js ~/pryzm/frontend/dist/index.html"
```

Expected (pinned):
```
06934b36f1c4747629e2733d4483568d  /home/ec2-user/pryzm/frontend/dist/assets/index-BBf5ejbC.js
403800309985c88dac7dd947f9ea0604  /home/ec2-user/pryzm/frontend/dist/index.html
```

- [ ] **Step 6: Live QA on the demo**

Go to `https://demo.pryzm-solutions.com/demo/`. Log in through Avanna's cookie gate.

From any dashboard page, open the mini-chat drawer and ask:

1. *"Give me a full Q1 health check: revenue, margin, win rate, top 5 at-risk customers, and what I should do next week."*
   - Drawer shows compact blocks. No overflow. No `€680,9…` clipping. No action plan. No download card.

2. *"Make a weekly report of customer 101580."*
   - Drawer shows narrative + metrics + factor breakdown compact. **No** download card in the drawer.

3. Click **View detailed** on both replies. AI Insights page shows the full layout including action plan and download card. Download PDF still works (verified by 2026-04-17-report-export plan).

- [ ] **Step 7: Final commit if any fixes were needed during QA**

If nothing had to change, skip. Otherwise:

```bash
git add -A
git commit -m "mini-chat-compact: polish from live QA"
```

---

## Self-review notes

**Spec coverage:**

- Renderer `compact` prop + `HIDDEN_IN_COMPACT` skip-list → Task 1.
- GlobalChatBar opts in → Task 2.
- Every block behaviour in the spec's matrix:
  - narrative / callout / clarification → Task 3.
  - metric_tile / metric_grid → Task 4.
  - data_table → Task 5.
  - ranked_list → Task 6.
  - factor_breakdown → Task 7.
  - comparison_cards → Task 8.
  - chart (line/bar/donut) → Task 9.
  - action_plan / report_download hidden → handled in Task 1 (no per-block change needed).
- BlockSkeleton compact heights → Task 10.
- Visual verification → Task 11 (local) + Task 12 (live).

**Placeholder scan:** none — every code step has complete code; every command has expected output; no "fill in the details".

**Type consistency:**

- `compact: boolean` prop with default `false` consistent across renderer and every block.
- `HIDDEN_IN_COMPACT = new Set(['action_plan', 'report_download'])` defined once in the renderer.
- `COMPACT_ITEM_LIMIT = 5` in RankedList, `COMPACT_ROW_LIMIT = 3` in DataTable — module-local constants, no cross-file coupling.
- Skeleton `compact` prop is also defaulted to `false` to match block components, so existing `/chat-debug` (no prop) continues to render full skeletons.

**Non-goals honored:**

- Schema, parser, prompt, ChatContext, AIInsights — untouched.
- Report generators — untouched.
- ChatDebug page — untouched (defaults to full mode via absence of `compact` prop).
- No width-based runtime adaptation — consumer-declared flag only.

**Risk coverage:**

- If `action_plan` or `report_download` becomes the only block in a reply, the mini-chat bubble is empty but the "View detailed" link remains clickable. Spec accepts this; no special handling.
- If the compact font choices look wrong in live QA, tweaks happen in Task 12 Step 7.
- No visual regression tests — manual QA only, matching the earlier report-export plan's approach.
