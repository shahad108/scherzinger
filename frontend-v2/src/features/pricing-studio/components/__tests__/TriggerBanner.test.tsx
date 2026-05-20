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

  it('renders the details paragraph below the headline', () => {
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={() => {}} />);
    const details = screen.getByTestId('trigger-banner-details');
    expect(details).toBeInTheDocument();
    expect(details.textContent ?? '').toMatch(
      /Forecasting flagged this SKU because the internal material-cost proxy stepped \+8% versus the prior month\./,
    );
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
    fireEvent.click(screen.getByTestId('trigger-banner-body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Enter on the body button triggers the drawer (native button activation)', () => {
    const onOpen = vi.fn();
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={onOpen} />);
    // Native <button> activates on click events for Enter; simulate that
    // path. We additionally assert keyDown alone does NOT fire the handler
    // since we removed the manual onKeyDown wiring.
    fireEvent.keyDown(screen.getByTestId('trigger-banner-body'), { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('trigger-banner-body'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('clicking the link does NOT also fire the drawer open (sibling buttons, no nesting)', () => {
    const onOpen = vi.fn();
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={onOpen} />);
    fireEvent.click(screen.getByTestId('trigger-banner-link'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keyboard Enter on the link navigates but does NOT open the drawer', () => {
    const onOpen = vi.fn();
    wrap(<TriggerBanner trigger={triggerContext()} onOpenCostDrawer={onOpen} />);
    // Native <button> handles Enter via click; emulate that path explicitly.
    fireEvent.click(screen.getByTestId('trigger-banner-link'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').textContent ?? '').toContain('/forecasting');
  });
});
