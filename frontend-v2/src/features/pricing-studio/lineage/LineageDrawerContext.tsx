// Pricing Studio v3 / Phase 1 — single-drawer lineage controller.
//
// One LineageDrawer instance is rendered at the page root; every
// `<LineageButton>` and price/tile click anywhere on the workbench calls
// `openLineage(ref)` to swap the open ref. Centralising state avoids
// rendering twelve drawer copies and lets us hold focus + ESC handlers
// in a single place.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LineageRefBlock } from '@/types/studio';

interface LineageDrawerState {
  openLineageRef: LineageRefBlock | null;
  /** Used by the drawer to label the relevant subject (e.g. "Why €127 for 200832-E?"). */
  subjectTitle: string | null;
  /** Open the drawer for a given lineage ref. ``null`` is a no-op. */
  openLineage: (ref: LineageRefBlock | null | undefined, opts?: OpenOpts) => void;
  closeLineage: () => void;
}

interface OpenOpts {
  /** Custom heading inside the drawer. */
  subjectTitle?: string | null;
}

const LineageDrawerCtx = createContext<LineageDrawerState | null>(null);

export function LineageDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ref: LineageRefBlock | null; title: string | null }>({
    ref: null,
    title: null,
  });

  const openLineage = useCallback(
    (ref: LineageRefBlock | null | undefined, opts?: OpenOpts) => {
      if (!ref) return;
      setState({ ref, title: opts?.subjectTitle ?? null });
    },
    [],
  );

  const closeLineage = useCallback(() => {
    setState({ ref: null, title: null });
  }, []);

  const value = useMemo<LineageDrawerState>(
    () => ({
      openLineageRef: state.ref,
      subjectTitle: state.title,
      openLineage,
      closeLineage,
    }),
    [closeLineage, openLineage, state.ref, state.title],
  );

  return <LineageDrawerCtx.Provider value={value}>{children}</LineageDrawerCtx.Provider>;
}

export function useLineageDrawer(): LineageDrawerState {
  const ctx = useContext(LineageDrawerCtx);
  if (!ctx) {
    throw new Error('useLineageDrawer must be used inside <LineageDrawerProvider>');
  }
  return ctx;
}
