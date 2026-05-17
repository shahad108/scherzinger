// Pricing Studio v3 / Phase 1 — single-drawer lineage controller.
//
// One LineageDrawer instance is rendered at the page root; every
// `<LineageButton>` and price/tile click anywhere on the workbench calls
// `openLineage(ref)` to swap the open ref. Centralising state avoids
// rendering twelve drawer copies and lets us hold focus + ESC handlers
// in a single place.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  LineageRefBlock,
  RecommendationDriver,
  WtpBlock,
} from '@/types/studio';

interface LineageDrawerState {
  openLineageRef: LineageRefBlock | null;
  /** Used by the drawer to label the relevant subject (e.g. "Why €127 for 200832-E?"). */
  subjectTitle: string | null;
  /** Optional drivers waterfall to render in the drawer body. */
  drivers: RecommendationDriver[] | null;
  /** Optional WTP block to render a band-strip in the drawer body. */
  wtp: WtpBlock | null;
  /** Optional recommended price (decimal-as-string) used by the WTP strip. */
  recommendedPrice: string | null;
  /** Open the drawer for a given lineage ref. ``null`` is a no-op. */
  openLineage: (ref: LineageRefBlock | null | undefined, opts?: OpenOpts) => void;
  closeLineage: () => void;
}

export interface OpenOpts {
  /** Custom heading inside the drawer. */
  subjectTitle?: string | null;
  /** Recommendation drivers to render as a waterfall section. */
  drivers?: RecommendationDriver[] | null;
  /** WTP block to render as a band-strip section. */
  wtp?: WtpBlock | null;
  /** Recommended price (decimal-as-string) used by the WTP strip overlay. */
  recommendedPrice?: string | null;
}

interface InternalState {
  ref: LineageRefBlock | null;
  title: string | null;
  drivers: RecommendationDriver[] | null;
  wtp: WtpBlock | null;
  recommendedPrice: string | null;
}

const EMPTY_STATE: InternalState = {
  ref: null,
  title: null,
  drivers: null,
  wtp: null,
  recommendedPrice: null,
};

const LineageDrawerCtx = createContext<LineageDrawerState | null>(null);

export function LineageDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InternalState>(EMPTY_STATE);

  const openLineage = useCallback(
    (ref: LineageRefBlock | null | undefined, opts?: OpenOpts) => {
      if (!ref) return;
      setState({
        ref,
        title: opts?.subjectTitle ?? null,
        drivers: opts?.drivers ?? null,
        wtp: opts?.wtp ?? null,
        recommendedPrice: opts?.recommendedPrice ?? null,
      });
    },
    [],
  );

  const closeLineage = useCallback(() => {
    setState(EMPTY_STATE);
  }, []);

  const value = useMemo<LineageDrawerState>(
    () => ({
      openLineageRef: state.ref,
      subjectTitle: state.title,
      drivers: state.drivers,
      wtp: state.wtp,
      recommendedPrice: state.recommendedPrice,
      openLineage,
      closeLineage,
    }),
    [
      closeLineage,
      openLineage,
      state.ref,
      state.title,
      state.drivers,
      state.wtp,
      state.recommendedPrice,
    ],
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
