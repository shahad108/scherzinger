// Pricing Studio v3 / Phase 3 — TriggerBanner tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { TriggerBanner } from '../TriggerBanner';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { triggerContext } from './fixtures-phase3';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function wrap(ui: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <LineageDrawerProvider>
        <Routes>
          <Route path="/studio" element={<>{ui}<LocationProbe /></>} />
          <Route path="/forecasting" element={<LocationProbe />} />
        </Routes>
      </LineageDrawerProvider>
    </MemoryRouter>,
  );
}

describe('TriggerBanner', () => {
  it('renders when trigger_context is present', () => {
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={() => {}} />);
    const banner = screen.getByTestId('trigger-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-source', 'forecasting');
    expect(banner).toHaveAttribute('data-reason', 'cost-spike');
    expect(banner).toHaveTextContent(/Steel S355 cost rose 8%/);
  });

  it('renders nothing when trigger is null', () => {
    const { container } = wrap(<TriggerBanner trigger={null} onOpenCostDrawer={() => {}} />);
    expect(container.querySelector('[data-testid="trigger-banner"]')).toBeNull();
  });

  it('clicking the link navigates to link_target', () => {
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={() => {}} />);
    fireEvent.click(screen.getByTestId('trigger-banner-link'));
    expect(screen.getByTestId('location').textContent ?? '').toContain('/forecasting');
    expect(screen.getByTestId('location').textContent ?? '').toContain('cluster=BKAGG');
  });

  it('clicking the banner body calls onOpenCostDrawer', () => {
    const onOpen = vi.fn();
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={onOpen} />);
    fireEvent.click(screen.getByTestId('trigger-banner'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Enter on the banner triggers the drawer', () => {
    const onOpen = vi.fn();
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={onOpen} />);
    fireEvent.keyDown(screen.getByTestId('trigger-banner'), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('clicking the link does NOT also fire the drawer open (stopPropagation)', () => {
    const onOpen = vi.fn();
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={onOpen} />);
    fireEvent.click(screen.getByTestId('trigger-banner-link'));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
