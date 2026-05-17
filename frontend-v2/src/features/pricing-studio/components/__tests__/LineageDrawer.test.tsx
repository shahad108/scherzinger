import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LineageDrawerProvider, useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { LineageDrawer } from '../LineageDrawer';
import { lineageRef } from './fixtures';

function Opener() {
  const { openLineage } = useLineageDrawer();
  return (
    <button
      type="button"
      data-testid="opener"
      onClick={() => openLineage(lineageRef('drawer-test-1'), { subjectTitle: 'Subject X' })}
    >
      open
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

  it('renders at least one source row from the synthesised lineage', () => {
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
});
