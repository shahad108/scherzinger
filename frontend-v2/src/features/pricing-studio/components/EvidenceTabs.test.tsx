// Pricing Studio v3 / Phase E (E1) — EvidenceTabs unit tests.
//
// Covers the 6-point acceptance contract:
//   1. Renders 5 tabs in the canonical order.
//   2. Default tab is "cost" when no `?tab=` param is present.
//   3. Clicking an enabled tab updates the `?tab=` URL param.
//   4. Disabled tabs render a lock icon and cannot be activated by click.
//   5. ArrowRight from `cost` cycles to the next enabled tab and skips
//      locked ones.
//   6. The pane content shown matches the active tab.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  MemoryRouter,
  Routes,
  Route,
  useSearchParams,
} from 'react-router-dom';
import { EvidenceTabs, type EvidenceTabKey, type EvidenceTabStatus } from './EvidenceTabs';

const ALL_LIVE: Record<EvidenceTabKey, EvidenceTabStatus> = {
  cost: 'live',
  quotes: 'live',
  customers: 'live',
  comparable: 'live',
  lineage: 'live',
};

function makePanes(): Record<EvidenceTabKey, React.ReactNode> {
  return {
    cost: <div data-testid="pane-body-cost">cost-body</div>,
    quotes: <div data-testid="pane-body-quotes">quotes-body</div>,
    customers: <div data-testid="pane-body-customers">customers-body</div>,
    comparable: <div data-testid="pane-body-comparable">comparable-body</div>,
    lineage: <div data-testid="pane-body-lineage">lineage-body</div>,
  };
}

// Tiny URL probe so tests can assert ?tab= changes without coupling to
// the EvidenceTabs implementation details. We render it as a sibling so
// the same router instance is shared.
function UrlProbe() {
  const [params] = useSearchParams();
  return <div data-testid="url-probe-tab">{params.get('tab') ?? ''}</div>;
}

function renderAt(
  initial: string,
  tabStatus: Record<EvidenceTabKey, EvidenceTabStatus> = ALL_LIVE,
  panes: Record<EvidenceTabKey, React.ReactNode> = makePanes(),
) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/studio"
          element={
            <>
              <UrlProbe />
              <EvidenceTabs tabStatus={tabStatus} panes={panes} />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EvidenceTabs', () => {
  it('renders all 5 tabs in order', () => {
    renderAt('/studio');
    const order: EvidenceTabKey[] = [
      'cost',
      'quotes',
      'customers',
      'comparable',
      'lineage',
    ];
    const labels = ['Cost', 'Quotes', 'Customers', 'Comparable', 'Lineage'];
    order.forEach((key, idx) => {
      const btn = screen.getByTestId(`evidence-tab-${key}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent(labels[idx]);
    });
  });

  it('defaults to "cost" when no ?tab= param is present', () => {
    renderAt('/studio');
    expect(screen.getByTestId('evidence-tab-cost')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('pane-body-cost')).toBeInTheDocument();
    // No other panes mounted.
    expect(screen.queryByTestId('pane-body-quotes')).not.toBeInTheDocument();
  });

  it('clicking an enabled tab updates the ?tab= URL param and switches pane', () => {
    renderAt('/studio');
    fireEvent.click(screen.getByTestId('evidence-tab-customers'));
    expect(screen.getByTestId('url-probe-tab')).toHaveTextContent('customers');
    expect(screen.getByTestId('evidence-tab-customers')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('pane-body-customers')).toBeInTheDocument();
    expect(screen.queryByTestId('pane-body-cost')).not.toBeInTheDocument();
  });

  it('disabled (non-live) tabs render a lock icon and cannot be activated', () => {
    const status: Record<EvidenceTabKey, EvidenceTabStatus> = {
      ...ALL_LIVE,
      comparable: 'locked',
      lineage: 'empty',
    };
    renderAt('/studio', status);
    const comparable = screen.getByTestId('evidence-tab-comparable');
    const lineage = screen.getByTestId('evidence-tab-lineage');
    expect(comparable).toBeDisabled();
    expect(lineage).toBeDisabled();
    expect(comparable.getAttribute('title')).toBe('Not enough data');
    // Both disabled tabs should contain the inline lock <svg>.
    expect(comparable.querySelector('svg')).not.toBeNull();
    expect(lineage.querySelector('svg')).not.toBeNull();
    // Clicking is a no-op.
    fireEvent.click(comparable);
    expect(screen.getByTestId('url-probe-tab')).toHaveTextContent('');
    expect(screen.getByTestId('evidence-tab-cost')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('ArrowRight from cost advances to the next enabled tab (skipping locked)', () => {
    // quotes locked → ArrowRight from cost should land on customers.
    const status: Record<EvidenceTabKey, EvidenceTabStatus> = {
      cost: 'live',
      quotes: 'locked',
      customers: 'live',
      comparable: 'locked',
      lineage: 'locked',
    };
    renderAt('/studio', status);
    const costBtn = screen.getByTestId('evidence-tab-cost');
    costBtn.focus();
    fireEvent.keyDown(costBtn, { key: 'ArrowRight' });
    expect(screen.getByTestId('url-probe-tab')).toHaveTextContent('customers');
    expect(screen.getByTestId('evidence-tab-customers')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders the corresponding pane content for the active tab', () => {
    renderAt('/studio?tab=comparable');
    expect(screen.getByTestId('evidence-tab-comparable')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('pane-body-comparable')).toHaveTextContent(
      'comparable-body',
    );
    // Switch via click → ensure pane swaps.
    fireEvent.click(screen.getByTestId('evidence-tab-lineage'));
    expect(screen.getByTestId('pane-body-lineage')).toBeInTheDocument();
    expect(screen.queryByTestId('pane-body-comparable')).not.toBeInTheDocument();
  });
});
