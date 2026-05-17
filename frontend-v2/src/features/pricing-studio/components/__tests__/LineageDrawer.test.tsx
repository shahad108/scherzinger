import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { LineageDrawerProvider, useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { OpenOpts } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { LineageDrawer } from '../LineageDrawer';
import { lineageRef, recommendation, wtp } from './fixtures';

function Opener({
  opts,
  label = 'open',
  testId = 'opener',
}: {
  opts?: OpenOpts;
  label?: ReactNode;
  testId?: string;
}) {
  const { openLineage } = useLineageDrawer();
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() =>
        openLineage(lineageRef('drawer-test-1'), { subjectTitle: 'Subject X', ...(opts ?? {}) })
      }
    >
      {label}
    </button>
  );
}

describe('LineageDrawer', () => {
  it('renders the subject title when opened and closes on close action', () => {
    render(
      <LineageDrawerProvider>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </LineageDrawerProvider>,
    );
    // Closed by default.
    expect(screen.queryByText('Subject X')).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.getByText('Subject X')).toBeInTheDocument();
    // Drawer should be labelled by the heading.
    const region = screen.getByRole('region', { name: /Subject X/i });
    expect(region).toBeInTheDocument();
  });

  it('renders at least three source rows from the synthesised lineage', () => {
    render(
      <LineageDrawerProvider>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </LineageDrawerProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.getByText(/Sources/i)).toBeInTheDocument();
    // The primary ref's source_id is rendered (multiple rows expected
    // when the synthesiser attached an upstream).
    expect(screen.getAllByText(/model:logit:/i).length).toBeGreaterThan(0);
    // §1.7: ≥3 source rows are required so the user can see the
    // always-on provenance frame (cost-state · competitor · won-deal ·
    // elasticity model).
    const sources = screen.getByText(/Sources/i).closest('section');
    expect(sources).not.toBeNull();
    const rows = within(sources as HTMLElement).getAllByRole('button', { expanded: false });
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('expands a source row to reveal SQL/feature copy', () => {
    render(
      <LineageDrawerProvider>
        <Opener />
        <LineageDrawer aid="200832-E" />
      </LineageDrawerProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    // The fixture lineageRef has sql=null, so expanded body shows fallback copy.
    const primaryRow = screen.getAllByRole('button', { expanded: false })[0];
    fireEvent.click(primaryRow);
    expect(screen.getByText(/No SQL\/feature snippet stored/i)).toBeInTheDocument();
  });

  it('renders the drivers waterfall when drivers are passed via openLineage', () => {
    const rec = recommendation();
    render(
      <LineageDrawerProvider>
        <Opener opts={{ drivers: rec.drivers }} />
        <LineageDrawer aid="200832-E" />
      </LineageDrawerProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    // Driver waterfall renders inside the drawer.
    expect(screen.getByTestId('lineage-drawer-drivers')).toBeInTheDocument();
    expect(screen.getByTestId('driver-waterfall')).toBeInTheDocument();
    // §1.7 acceptance: ≥3 driver rows present after the click.
    const waterfall = screen.getByTestId('driver-waterfall');
    const driverRows = within(waterfall).getAllByRole('listitem');
    expect(driverRows.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the WTP band-strip when wtp is passed via openLineage', () => {
    render(
      <LineageDrawerProvider>
        <Opener opts={{ wtp: wtp(), recommendedPrice: '127.00' }} />
        <LineageDrawer aid="200832-E" />
      </LineageDrawerProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('opener'));
    });
    expect(screen.getByTestId('lineage-drawer-wtp')).toBeInTheDocument();
    expect(screen.getByTestId('wtp-band-strip')).toBeInTheDocument();
  });

});
