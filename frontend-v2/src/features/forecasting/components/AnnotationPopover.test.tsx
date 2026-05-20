import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { AnnotationPopover } from './AnnotationPopover';

const fetchMock = vi.fn();

beforeEach(() => {
  // useForecastAnnotations + useCreateAnnotation + useDeleteAnnotation all use
  // fetch() directly; mock at the global level.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = fetchMock as any;
  fetchMock.mockReset();
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function listResponse(items: unknown[] = []) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ items }),
  };
}

describe('AnnotationPopover', () => {
  it('renders the popover with target label and empty state', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]));
    wrap(
      <AnnotationPopover
        anchor={{ x: 100, y: 100 }}
        target={{ kind: 'month', value: '2026-08' }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('annotation-popover')).toBeInTheDocument();
    expect(screen.getByText(/Month 2026-08/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No notes yet/i)).toBeInTheDocument();
    });
  });

  it('lists existing annotations and exposes delete buttons', async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([
        {
          id: 'a1',
          target: { kind: 'month', value: '2026-08' },
          body: 'Q3 renegotiation closed early',
          author: 'Frank',
          createdAt: '2026-05-14T10:00:00Z',
        },
      ]),
    );
    wrap(
      <AnnotationPopover
        anchor={{ x: 100, y: 100 }}
        target={{ kind: 'month', value: '2026-08' }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Q3 renegotiation closed early')).toBeInTheDocument();
    });
    expect(screen.getByTestId('annotation-delete-a1')).toBeInTheDocument();
  });

  it('disables Save until the body is non-empty and calls POST', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([])); // initial list
    wrap(
      <AnnotationPopover
        anchor={{ x: 100, y: 100 }}
        target={{ kind: 'cluster', value: 'CL-A' }}
        onClose={() => {}}
      />,
    );
    const save = screen.getByTestId('annotation-save');
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByTestId('annotation-body'), {
      target: { value: 'pricing approvals stuck' },
    });
    expect(save).not.toBeDisabled();

    // POST then re-list.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'new-id',
            target: { kind: 'cluster', value: 'CL-A' },
            body: 'pricing approvals stuck',
            author: 'Frank',
            createdAt: '2026-05-14T10:01:00Z',
          }),
      })
      .mockResolvedValueOnce(listResponse([]));

    fireEvent.click(save);

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const post = calls.find((c) => c[1]?.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse(post![1].body);
      expect(body).toEqual({
        target: { kind: 'cluster', value: 'CL-A' },
        body: 'pricing approvals stuck',
      });
    });
  });

  it('calls DELETE when the delete button is clicked', async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([
        {
          id: 'a1',
          target: { kind: 'month', value: '2026-08' },
          body: 'note',
          author: 'Frank',
          createdAt: '2026-05-14T10:00:00Z',
        },
      ]),
    );
    wrap(
      <AnnotationPopover
        anchor={{ x: 100, y: 100 }}
        target={{ kind: 'month', value: '2026-08' }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => screen.getByTestId('annotation-delete-a1'));

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce(listResponse([]));

    fireEvent.click(screen.getByTestId('annotation-delete-a1'));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE');
      expect(del).toBeTruthy();
      expect(del![0]).toContain('/api/v1/forecast/annotations/a1');
    });
  });

  it('closes on Escape', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]));
    const onClose = vi.fn();
    wrap(
      <AnnotationPopover
        anchor={{ x: 100, y: 100 }}
        target={{ kind: 'month', value: '2026-08' }}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
