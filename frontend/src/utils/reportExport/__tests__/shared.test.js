import { describe, it, expect } from 'vitest';
import {
  BRAND, MARGINS_PT, FONTS,
  resolveDefaultFormat,
  flattenConversation,
  blockSectionLabel,
} from '../shared';

describe('BRAND + MARGINS_PT + FONTS', () => {
  it('exposes brand constants', () => {
    expect(BRAND.name).toBe('PRYZM');
    expect(BRAND.footerText).toMatch(/PRYZM/);
    expect(MARGINS_PT).toEqual({ top: 54, right: 54, bottom: 64, left: 54 });
    expect(FONTS.heading).toBeTruthy();
    expect(FONTS.body).toBeTruthy();
  });
});

describe('resolveDefaultFormat', () => {
  it('honors explicit hint "excel"', () => {
    expect(resolveDefaultFormat({ blocks: [] }, 'Make an excel file of stuff')).toBe('xlsx');
  });
  it('honors explicit hint "word"', () => {
    expect(resolveDefaultFormat({ blocks: [] }, 'Export as a word doc')).toBe('docx');
  });
  it('honors explicit hint "pdf"', () => {
    expect(resolveDefaultFormat({ blocks: [] }, 'PDF please')).toBe('pdf');
  });
  it('infers xlsx when blocks are table-heavy', () => {
    const blocks = [
      { type: 'data_table' }, { type: 'ranked_list' }, { type: 'narrative' },
    ];
    expect(resolveDefaultFormat({ blocks }, 'make a report')).toBe('xlsx');
  });
  it('defaults to pdf otherwise', () => {
    const blocks = [{ type: 'narrative' }, { type: 'metric_grid' }];
    expect(resolveDefaultFormat({ blocks }, 'report')).toBe('pdf');
  });
});

describe('flattenConversation', () => {
  it('inlines user questions as synthetic narrative blocks', () => {
    const messages = [
      { role: 'user', content: 'hello?' },
      { role: 'assistant', format: 'structured', blocks: [
        { type: 'narrative', text: 'world' },
      ]},
      { role: 'user', content: 'another?' },
      { role: 'assistant', format: 'structured', blocks: [
        { type: 'callout', tone: 'insight', text: 'ok' },
      ]},
    ];
    const flat = flattenConversation(messages);
    expect(flat.length).toBe(4);
    expect(flat[0]).toMatchObject({ type: 'narrative', tone: 'neutral' });
    expect(flat[0].text).toMatch(/hello\?/);
    expect(flat[1]).toMatchObject({ type: 'narrative', text: 'world' });
    expect(flat[2]).toMatchObject({ type: 'narrative', tone: 'neutral' });
    expect(flat[3]).toMatchObject({ type: 'callout' });
  });

  it('skips empty + non-structured messages gracefully', () => {
    const flat = flattenConversation([
      { role: 'user', content: '' },
      { role: 'assistant', format: 'markdown', content: 'legacy' },
    ]);
    expect(flat).toEqual([]);
  });

  it('strips report_download blocks from output', () => {
    const messages = [
      { role: 'user', content: 'make a report' },
      { role: 'assistant', format: 'structured', blocks: [
        { type: 'narrative', text: 'report' },
        { type: 'report_download', title: 'x', scope: 'reply', defaultFormat: 'pdf' },
      ]},
    ];
    const flat = flattenConversation(messages);
    expect(flat.some(b => b.type === 'report_download')).toBe(false);
  });
});

describe('blockSectionLabel', () => {
  it('returns a human-readable label for each block type', () => {
    expect(blockSectionLabel({ type: 'narrative' })).toBe('Narrative');
    expect(blockSectionLabel({ type: 'metric_grid' })).toBe('Key metrics');
    expect(blockSectionLabel({ type: 'comparison_cards' })).toBe('Comparison');
    expect(blockSectionLabel({ type: 'ranked_list' })).toBe('Ranked list');
    expect(blockSectionLabel({ type: 'factor_breakdown' })).toBe('Factor breakdown');
    expect(blockSectionLabel({ type: 'chart' })).toBe('Chart');
    expect(blockSectionLabel({ type: 'callout' })).toBe('Note');
    expect(blockSectionLabel({ type: 'action_plan' })).toBe('Recommended actions');
    expect(blockSectionLabel({ type: 'data_table' })).toBe('Data');
  });
});
