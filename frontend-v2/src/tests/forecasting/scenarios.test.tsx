/**
 * Phase 5 — Scenario library + builder smoke tests.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ScenarioLibrary } from '@/features/forecasting/components/ScenarioLibrary';
import { ScenarioBuilder } from '@/features/forecasting/components/ScenarioBuilder';

function withProviders(ui: React.ReactNode, route = '/forecasting') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.removeItem('__scenario_memory__');
});

describe('ScenarioLibrary (Phase 5)', () => {
  it('renders the three system scenarios', async () => {
    render(withProviders(<ScenarioLibrary />));
    await waitFor(() =>
      expect(
        screen.getByTestId('scenario-chip-00000000-0000-0000-0000-000000000001'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Base case')).toBeInTheDocument();
    expect(screen.getByText('Steel shock +10%')).toBeInTheDocument();
    expect(screen.getByText('Multi-input shock')).toBeInTheDocument();
  });

  it('clicking a scenario chip sets ?scenario_id=', async () => {
    render(withProviders(<ScenarioLibrary />, '/forecasting'));
    await waitFor(() =>
      expect(
        screen.getByTestId('scenario-chip-00000000-0000-0000-0000-000000000002'),
      ).toBeInTheDocument(),
    );
    const chip = screen.getByTestId('scenario-chip-00000000-0000-0000-0000-000000000002');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(
        screen.getByTestId('scenario-chip-00000000-0000-0000-0000-000000000002'),
      ).toHaveClass(/rose-deep/);
    });
  });

  it('opening + saving a scenario adds it to My scenarios', async () => {
    render(withProviders(<ScenarioLibrary />));
    await waitFor(() => expect(screen.getByTestId('scenario-library')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('scenario-add'));
    await waitFor(() => expect(screen.getByTestId('scenario-builder')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('scenario-name'), {
      target: { value: 'Test private scenario' },
    });
    fireEvent.click(screen.getByTestId('scenario-save'));
    await waitFor(() => {
      expect(screen.getByText('Test private scenario')).toBeInTheDocument();
    });
  });
});

describe('ScenarioBuilder validation (Phase 5)', () => {
  it('save button is disabled until the name is non-empty', () => {
    render(withProviders(<ScenarioBuilder open onClose={() => {}} />));
    const save = screen.getByTestId('scenario-save');
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId('scenario-name'), { target: { value: 'X' } });
    expect(save).not.toBeDisabled();
  });

  it('does not render sliders — typed inputs only', () => {
    render(withProviders(<ScenarioBuilder open onClose={() => {}} />));
    // Tap a preset to add an input row.
    fireEvent.click(screen.getByText(/Steel S355/));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByTestId('scenario-value-Steel S355')).toHaveAttribute('type', 'number');
  });
});
