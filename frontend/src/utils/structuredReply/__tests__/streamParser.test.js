import { describe, it, expect, beforeEach } from 'vitest';
import { createStreamParser } from '../streamParser';

describe('createStreamParser', () => {
  let p;
  beforeEach(() => { p = createStreamParser(); });

  it('returns empty on empty input', () => {
    const r = p.feed('');
    expect(r.blocks).toEqual([]);
    expect(r.status).toEqual([]);
  });

  it('returns empty on pre-array input', () => {
    const r = p.feed('{"blocks":[');
    expect(r.blocks).toEqual([]);
  });

  it('marks an in-flight block as pending', () => {
    const r = p.feed('{"blocks":[{"type":"narrative","text":"hel');
    expect(r.blocks.length).toBe(1);
    expect(r.status[0]).toBe('pending');
  });

  it('marks a completed block as ready when a later block appears', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"hello"}');
    const r = p.feed(',{"type":"callout","tone":"insight","text":"x"');
    expect(r.status[0]).toBe('ready');
    expect(r.status[1]).toBe('pending');
  });

  it('marks the final block as ready when finalize() is called', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"hello"}]}');
    const r = p.finalize();
    expect(r.blocks.length).toBe(1);
    expect(r.status[0]).toBe('ready');
  });

  it('never regresses a ready block back to pending', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"a"}');
    const mid = p.feed(',{"type":"narrative","text":"b');
    expect(mid.status[0]).toBe('ready');
    const later = p.feed('c"}');
    expect(later.status[0]).toBe('ready');
  });

  it('reports ok=false from finalize on malformed JSON', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"oops');
    const r = p.finalize();
    expect(r.ok).toBe(false);
  });

  it('reports ok=true from finalize on clean JSON', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"ok"}]}');
    const r = p.finalize();
    expect(r.ok).toBe(true);
  });

  it('handles a fully chunked stream', () => {
    const full = '{"blocks":[{"type":"narrative","text":"hi"},{"type":"callout","tone":"insight","text":"x"}]}';
    for (const ch of full) p.feed(ch);
    const r = p.finalize();
    expect(r.ok).toBe(true);
    expect(r.blocks.length).toBe(2);
    expect(r.status).toEqual(['ready', 'ready']);
  });
});
