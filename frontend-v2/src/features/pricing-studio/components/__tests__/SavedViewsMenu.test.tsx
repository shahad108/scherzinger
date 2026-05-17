// Pricing Studio v3 / Phase 11 — SavedViewsMenu tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SavedViewsMenu } from '../SavedViewsMenu';

// Mock the saved-views hooks so we drive list/create/delete from the test.
const listMock = vi.fn();
const createMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/data/api/useSettings', () => ({
  useSavedViews: () => listMock(),
  useCreateSavedView: () => ({ mutate: createMutate, isPending: false }),
  useDeleteSavedView: () => ({ mutate: deleteMutate, isPending: false }),
}));

function renderWith(initial = '/studio?tier=A') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <SavedViewsMenu />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SavedViewsMenu', () => {
  beforeEach(() => {
    listMock.mockReset();
    createMutate.mockReset();
    deleteMutate.mockReset();
  });

  it('renders the trigger', () => {
    listMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    renderWith();
    expect(screen.getByTestId('saved-views-trigger')).toBeInTheDocument();
  });

  it('shows empty state when no views exist', () => {
    listMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    renderWith();
    fireEvent.click(screen.getByTestId('saved-views-trigger'));
    expect(screen.getByTestId('saved-views-empty')).toBeInTheDocument();
  });

  it('lists saved views and shows count badge', () => {
    listMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'v1',
            screen: 'studio',
            label: 'Tier A frames',
            filters: { tier: 'A' },
            is_default: false,
            created_at: null,
            updated_at: null,
          },
        ],
      },
      isLoading: false,
    });
    renderWith();
    expect(screen.getByTestId('saved-views-trigger').textContent ?? '').toContain('1');
    fireEvent.click(screen.getByTestId('saved-views-trigger'));
    expect(screen.getByTestId('saved-view-row-v1')).toBeInTheDocument();
    expect(screen.getByText('Tier A frames')).toBeInTheDocument();
  });

  it('saves current filters when "Save current view" is clicked', async () => {
    listMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My View');
    renderWith('/studio?tier=A&family=BKAGG');
    fireEvent.click(screen.getByTestId('saved-views-trigger'));
    fireEvent.click(screen.getByTestId('saved-views-save-current'));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      screen: 'studio',
      label: 'My View',
      filters: { tier: 'A', family: 'BKAGG' },
    });
    promptSpy.mockRestore();
  });

  it('deletes a saved view', () => {
    listMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'v1',
            screen: 'studio',
            label: 'Tier A',
            filters: {},
            is_default: false,
            created_at: null,
            updated_at: null,
          },
        ],
      },
      isLoading: false,
    });
    renderWith();
    fireEvent.click(screen.getByTestId('saved-views-trigger'));
    fireEvent.click(screen.getByTestId('saved-view-delete-v1'));
    expect(deleteMutate).toHaveBeenCalledWith('v1');
  });
});
