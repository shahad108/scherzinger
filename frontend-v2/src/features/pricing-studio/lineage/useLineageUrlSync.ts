// Pricing Studio v3 / Phase 11 — keep `?lineage_ref={id}` in lockstep with
// the lineage drawer open state. We split this out of LineageDrawerContext
// so component tests that mount the provider WITHOUT a router don't
// regress: only routed pages (Pricing Studio) call this hook.

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLineageDrawer } from './LineageDrawerContext';
import type { LineageRefBlock } from '@/types/studio';

export function useLineageUrlSync(): void {
  const [params, setParams] = useSearchParams();
  const { openLineageRef, openLineage, closeLineage } = useLineageDrawer();
  const lastSeenIdRef = useRef<string | null>(null);

  // URL → state: on first mount, restore the drawer when the URL carries
  // a `lineage_ref`. We synthesise the minimum `LineageRefBlock` shape;
  // the underlying lineage fetch needs only `id` and the drawer header
  // degrades to "Lineage · unknown" when the rest is absent.
  const urlRef = params.get('lineage_ref');
  useEffect(() => {
    if (!urlRef) {
      if (openLineageRef) {
        // URL was cleared (back-button) — also close the drawer.
        closeLineage();
      }
      return;
    }
    if (openLineageRef?.id === urlRef) return;
    const synthetic = {
      id: urlRef,
      source_kind: 'unknown',
      source_id: urlRef,
      model: null,
      computed_at: '',
      computed_by: '',
    } as LineageRefBlock;
    openLineage(synthetic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRef]);

  // State → URL: when the user opens/closes via a button, write the URL.
  useEffect(() => {
    const id = openLineageRef?.id ?? null;
    if (id === lastSeenIdRef.current) return;
    lastSeenIdRef.current = id;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('lineage_ref', id);
      else next.delete('lineage_ref');
      return next;
    }, { replace: true });
  }, [openLineageRef, setParams]);
}
