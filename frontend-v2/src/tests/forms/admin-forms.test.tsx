/**
 * Phase 7 — admin/shell forms.
 *
 * Mocks the network layer at postJson and verifies AddSection /
 * SavedViewSave / AddReviewer post the right body to the right
 * endpoint with proper validation gating.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AddSectionForm } from '@/components/forms/AddSectionForm';
import { SavedViewSaveForm } from '@/components/forms/SavedViewSaveForm';
import { AddReviewerForm } from '@/components/forms/AddReviewerForm';

const postJson = vi.hoisted(() =>
  vi.fn().mockImplementation((path: string, body: unknown) => {
    return Promise.resolve({ id: 'mock', ...((body as object) ?? {}) });
  }),
);
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn().mockResolvedValue({ items: [] }),
  postJson,
}));

beforeEach(() => postJson.mockClear());

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}
const noop = () => {};

describe('AddSectionForm', () => {
  it('blocks submit until title >= 2 chars; posts to /sections', async () => {
    render(withQc(<AddSectionForm context={{}} onClose={noop} onToast={noop} />));
    const btn = screen.getByRole('button', { name: /Pin section/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Q3 renewal queue/i), {
      target: { value: 'My Q3 queue' },
    });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    await waitFor(() => expect(postJson).toHaveBeenCalled());
    const [path, body] = postJson.mock.calls[0];
    expect(path).toBe('/sections');
    expect(body).toMatchObject({ title: 'My Q3 queue', href: '/action-center' });
  });
});

describe('SavedViewSaveForm', () => {
  it('captures filter snapshot and posts to /saved-views', async () => {
    render(
      withQc(
        <SavedViewSaveForm
          context={{ screen: 'action-center', filters: { hide_locked: true, cluster: 'BKAES' } }}
          onClose={noop}
          onToast={noop}
        />,
      ),
    );
    expect(screen.getByText(/hide_locked=/)).toBeInTheDocument();
    expect(screen.getByText(/cluster=/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Movable BKAES/i), {
      target: { value: 'Locked-out, BKAES' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save view/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalled());
    const [path, body] = postJson.mock.calls[0];
    expect(path).toBe('/saved-views');
    expect(body).toMatchObject({
      screen: 'action-center',
      label: 'Locked-out, BKAES',
      filters: { hide_locked: true, cluster: 'BKAES' },
      is_default: false,
    });
  });
});

describe('AddReviewerForm', () => {
  it('blocks submit when panelId missing; otherwise posts to panel reviewers', async () => {
    const { rerender } = render(
      withQc(<AddReviewerForm context={{}} onClose={noop} onToast={noop} />),
    );
    expect(screen.getByRole('button', { name: /Add reviewer/i })).toBeDisabled();

    rerender(
      withQc(
        <AddReviewerForm
          context={{ panelId: 'panel-1', panelLabel: 'MD review' }}
          onClose={noop}
          onToast={noop}
        />,
      ),
    );

    fireEvent.change(screen.getByPlaceholderText(/FK/i), { target: { value: 'fk' } });
    fireEvent.click(screen.getByRole('button', { name: /Add reviewer/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalled());
    const [path, body] = postJson.mock.calls[0];
    expect(path).toBe('/panels/panel-1/reviewers');
    expect(body).toMatchObject({ initials: 'FK' });
  });
});
