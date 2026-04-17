import { parse, ALL as PARTIAL_ALL } from 'partial-json';

/**
 * Incremental parser for {blocks: [...]}. Re-parses the accumulated buffer
 * each feed() with partial-json's permissive mode; derives per-block ready/pending
 * status. Once a block is ready it never reverts.
 */
export function createStreamParser() {
  let buf = '';
  let lastReadyIdx = -1; // index of last block known to be complete

  function computeFromBuffer(closed) {
    let parsed;
    try {
      parsed = parse(buf, PARTIAL_ALL);
    } catch {
      parsed = null;
    }
    const blocks = parsed && Array.isArray(parsed.blocks) ? parsed.blocks : [];

    // Promote ready index: if blocks.length grew, all previous blocks are definitely complete.
    if (blocks.length - 1 > lastReadyIdx && blocks.length > 0) {
      // Everything before the last index is fully serialized.
      lastReadyIdx = Math.max(lastReadyIdx, blocks.length - 2);
    }
    // On stream close, the final block is also ready.
    if (closed && blocks.length > 0) {
      lastReadyIdx = blocks.length - 1;
    }

    const status = blocks.map((_, i) => (i <= lastReadyIdx ? 'ready' : 'pending'));
    return { blocks, status };
  }

  return {
    feed(chunk) {
      buf += chunk;
      return computeFromBuffer(false);
    },
    finalize() {
      let ok = true;
      try {
        JSON.parse(buf);
      } catch {
        ok = false;
      }
      const result = computeFromBuffer(true);
      return { ...result, ok, raw: buf };
    },
    getBuffer() { return buf; },
  };
}
