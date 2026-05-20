import { describe, it, expect } from 'vitest';
import { validateBlock, BLOCK_TYPES } from '../schema';

describe('validateBlock', () => {
  it('rejects unknown block type', () => {
    expect(validateBlock({ type: 'wat' }).ok).toBe(false);
  });

  it('accepts a minimal narrative', () => {
    expect(validateBlock({ type: 'narrative', text: 'hi' })).toEqual({ ok: true });
  });

  it('rejects narrative without text', () => {
    const r = validateBlock({ type: 'narrative' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/text/);
  });

  it('accepts a metric_tile with label+value', () => {
    expect(validateBlock({ type: 'metric_tile', label: 'LTV', value: 1000 }).ok).toBe(true);
  });

  it('rejects metric_grid with zero tiles', () => {
    expect(validateBlock({ type: 'metric_grid', tiles: [] }).ok).toBe(false);
  });

  it('accepts a comparison_cards with aligned subjects/metrics', () => {
    const spec = {
      type: 'comparison_cards',
      subjects: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }],
      metrics: [{ key: 'ltv', label: 'LTV', values: [100, 200] }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects comparison_cards with misaligned values', () => {
    const spec = {
      type: 'comparison_cards',
      subjects: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }],
      metrics: [{ key: 'ltv', label: 'LTV', values: [100] }],
    };
    expect(validateBlock(spec).ok).toBe(false);
  });

  it('accepts a ranked_list with items', () => {
    const spec = {
      type: 'ranked_list',
      items: [{ id: 'c1', label: 'A', primary: { label: 'LTV', value: 100 } }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('accepts a factor_breakdown with status', () => {
    const spec = {
      type: 'factor_breakdown',
      factors: [{ label: 'Recency', status: 'critical' }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('coerces factor_breakdown bad status to moderate', () => {
    // LLMs emit synonyms ("high", "severe", "amber"); validator is tolerant.
    const spec = {
      type: 'factor_breakdown',
      factors: [{ label: 'Recency', status: 'broken' }],
    };
    expect(validateBlock(spec).ok).toBe(true);
    expect(spec.factors[0].status).toBe('moderate');
  });

  it('accepts a chart with variant+series', () => {
    expect(validateBlock({ type: 'chart', variant: 'line', series: [{ name: 'a', data: [1, 2] }] }).ok).toBe(true);
  });

  it('rejects chart with unsupported variant', () => {
    expect(validateBlock({ type: 'chart', variant: 'radar', series: [] }).ok).toBe(false);
  });

  it('accepts a callout', () => {
    expect(validateBlock({ type: 'callout', tone: 'insight', text: 'x' }).ok).toBe(true);
  });

  it('accepts an action_plan', () => {
    const spec = {
      type: 'action_plan',
      actions: [{ title: 'Do the thing', priority: 'high' }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('accepts a data_table', () => {
    const spec = {
      type: 'data_table',
      columns: [{ key: 'a', label: 'A' }],
      rows: [{ a: 1 }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('accepts a clarification', () => {
    expect(validateBlock({ type: 'clarification', question: 'Which customer?' }).ok).toBe(true);
  });

  it('exposes BLOCK_TYPES constant', () => {
    expect(BLOCK_TYPES).toContain('narrative');
    expect(BLOCK_TYPES).toContain('comparison_cards');
    expect(BLOCK_TYPES).toContain('clarification');
  });

  it('accepts a minimal report_download', () => {
    const spec = {
      type: 'report_download',
      title: 'Customer 101580 — Weekly Health Report',
      scope: 'reply',
      defaultFormat: 'pdf',
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects report_download without title', () => {
    expect(validateBlock({ type: 'report_download', scope: 'reply', defaultFormat: 'pdf' }).ok).toBe(false);
  });

  it('rejects report_download with invalid scope', () => {
    expect(validateBlock({
      type: 'report_download', title: 'x', scope: 'history', defaultFormat: 'pdf',
    }).ok).toBe(false);
  });

  it('rejects report_download with invalid defaultFormat', () => {
    expect(validateBlock({
      type: 'report_download', title: 'x', scope: 'reply', defaultFormat: 'txt',
    }).ok).toBe(false);
  });

  it('accepts report_download with sections', () => {
    const spec = {
      type: 'report_download',
      title: 'x',
      scope: 'reply',
      defaultFormat: 'pdf',
      sections: [{ label: 'Risks', blockIndex: 0 }, { label: 'Actions', blockIndex: 2 }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects report_download with non-integer blockIndex', () => {
    const spec = {
      type: 'report_download',
      title: 'x',
      scope: 'reply',
      defaultFormat: 'pdf',
      sections: [{ label: 'Risks', blockIndex: 'zero' }],
    };
    expect(validateBlock(spec).ok).toBe(false);
  });

  it('includes report_download in BLOCK_TYPES', () => {
    expect(BLOCK_TYPES).toContain('report_download');
  });
});
