// Shared providers for Phase 1 component tests. Many components depend on
// the LineageDrawerProvider context (LineageButton, hero, tiles); wrap each
// render through `renderWithLineage()` so they don't throw.

import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';

export function renderWithLineage(ui: ReactNode) {
  return render(<LineageDrawerProvider>{ui}</LineageDrawerProvider>);
}
