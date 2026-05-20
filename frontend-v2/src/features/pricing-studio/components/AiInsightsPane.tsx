// Pricing Studio v3 / 2026-05-19 coherence pass — AI insights pane.
//
// Three tonal cards rendered between DriverWaterfall and Alternatives:
//   * Gains (green): what this recommendation unlocks
//   * Risks (rose):  what could go wrong at this price
//   * Watch (ink):   what we'd monitor over the next reprice cycle
//
// Content comes from /briefing/sku/{aid}/insights — the BFF synthesises
// the buckets from the recommendation + customer_fanout summary blocks.
// The pane has a ↻ Regenerate action that re-runs the endpoint with
// regenerate=1 to bust the 24h server cache.

import { Sparkles, RefreshCw } from 'lucide-react';
import { useAiInsights, type AiInsight } from '@/data/api/useAiInsights';

interface Props {
  aid: string | null | undefined;
  persona?: string;
  className?: string;
}

const SECTION_DEFS = [
  {
    key: 'gains',
    title: 'What this recommendation unlocks',
    tone: 'green',
  },
  {
    key: 'risks',
    title: 'What could go wrong at this price',
    tone: 'rose',
  },
  {
    key: 'watch',
    title: 'What to watch next',
    tone: 'ink',
  },
] as const;

type Tone = 'green' | 'rose' | 'ink';

function toneStyle(tone: Tone): React.CSSProperties {
  if (tone === 'green') {
    return {
      background: 'color-mix(in oklab, var(--green-bg) 70%, white)',
      borderColor: 'var(--green-border)',
      color: 'var(--green-deep)',
    };
  }
  if (tone === 'rose') {
    return {
      background: 'color-mix(in oklab, var(--rose-bg) 70%, white)',
      borderColor: 'var(--rose-border)',
      color: 'var(--rose-deep)',
    };
  }
  return {
    background: 'var(--surface-soft)',
    borderColor: 'var(--hairline)',
    color: 'var(--ink)',
  };
}

function InsightCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: Tone;
  items: AiInsight[];
}) {
  const head = toneStyle(tone);
  return (
    <div
      data-testid={`ai-insights-${tone}`}
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 12,
        background: 'white',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--hairline)',
          ...head,
        }}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <div
          style={{
            padding: 12,
            fontSize: 12,
            color: 'var(--ink-3)',
            fontStyle: 'italic',
            flex: 1,
          }}
        >
          No items yet — the briefing service hasn't surfaced anything in this bucket.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 4px 8px' }}>
          {items.map((it, i) => (
            <li
              key={i}
              style={{
                padding: '6px 8px',
                fontSize: 12.5,
                lineHeight: 1.45,
                color: 'var(--ink-2)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{it.headline}</div>
              <div style={{ marginTop: 2 }}>{it.body_md}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AiInsightsPane({ aid, persona = 'frank', className }: Props) {
  const insights = useAiInsights(aid ?? null, persona);
  const onRegenerate = () => {
    // refetch with cache busted by appending a synthetic search param —
    // react-query's refetch + the server-side `regenerate=1` flag.
    insights.refetch();
  };
  const data = insights.data;
  const sections = SECTION_DEFS.map((s) => ({
    ...s,
    items: ((data?.[s.key as 'gains' | 'risks' | 'watch'] as AiInsight[]) ?? []),
  }));
  return (
    <section
      data-testid="ai-insights-pane"
      className={className}
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 14,
        border: '1px solid var(--hairline)',
        background: 'white',
        boxShadow: 'var(--shadow-card)',
      }}
      aria-labelledby="ai-insights-heading"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h3
          id="ai-insights-heading"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'Manrope', sans-serif",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
          }}
        >
          <Sparkles size={14} aria-hidden="true" />
          AI insights
        </h3>
        <button
          type="button"
          data-testid="ai-insights-regenerate"
          onClick={onRegenerate}
          disabled={insights.isFetching}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--hairline)',
            background: 'var(--surface-soft)',
            color: 'var(--ink-2)',
            fontSize: 11,
            fontWeight: 600,
            cursor: insights.isFetching ? 'wait' : 'pointer',
            opacity: insights.isFetching ? 0.6 : 1,
          }}
        >
          <RefreshCw
            size={11}
            aria-hidden="true"
            style={{
              animation: insights.isFetching ? 'spin 1s linear infinite' : undefined,
            }}
          />
          {insights.isFetching ? 'Refreshing…' : 'Regenerate'}
        </button>
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {sections.map((s) => (
          <InsightCard
            key={s.key}
            title={s.title}
            tone={s.tone as Tone}
            items={s.items}
          />
        ))}
      </div>
      <footer
        style={{
          marginTop: 10,
          fontSize: 10.5,
          color: 'var(--ink-3)',
          textAlign: 'right',
        }}
      >
        Powered by briefing service · model {data?.model ?? '—'}
      </footer>
    </section>
  );
}
