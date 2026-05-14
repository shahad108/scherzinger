/**
 * v2.2 Phase I — BriefingButton: persona + language toggle.
 *
 * Asserts the two new Fields render in the drawer and that submission
 * posts a body containing ``persona`` and ``language``.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Spy on postJson — the component goes through the mockResolve path in
// vitest (USE_MOCKS = true), so we wrap it to capture the body it sees.
import * as apiClient from '@/lib/api/client';
import { BriefingButton } from './BriefingButton';

function withProviders(ui: React.ReactNode, route = '/forecasting') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('BriefingButton (v2.2 Phase I)', () => {
  it('renders persona + language fields with sensible defaults', () => {
    render(withProviders(<BriefingButton />));
    fireEvent.click(screen.getByTestId('briefing-open'));
    const persona = screen.getByTestId('briefing-persona') as HTMLSelectElement;
    const language = screen.getByTestId('briefing-language') as HTMLSelectElement;
    expect(persona).toBeInTheDocument();
    expect(language).toBeInTheDocument();
    // Default persona = analyst_memo (preserves prior behavior).
    expect(persona.value).toBe('analyst_memo');
    expect(language.value).toBe('en');
  });

  it('auto-flips language to de when user picks the Manuel persona', () => {
    render(withProviders(<BriefingButton />));
    fireEvent.click(screen.getByTestId('briefing-open'));
    const persona = screen.getByTestId('briefing-persona') as HTMLSelectElement;
    const language = screen.getByTestId('briefing-language') as HTMLSelectElement;
    fireEvent.change(persona, { target: { value: 'manuel_1pager' } });
    expect(persona.value).toBe('manuel_1pager');
    expect(language.value).toBe('de');
  });

  it('respects an explicit language choice after the user touches it', () => {
    render(withProviders(<BriefingButton />));
    fireEvent.click(screen.getByTestId('briefing-open'));
    const persona = screen.getByTestId('briefing-persona') as HTMLSelectElement;
    const language = screen.getByTestId('briefing-language') as HTMLSelectElement;
    // User overrides language first, then flips persona.
    fireEvent.change(language, { target: { value: 'de' } });
    fireEvent.change(persona, { target: { value: 'manuel_1pager' } });
    fireEvent.change(language, { target: { value: 'en' } });
    fireEvent.change(persona, { target: { value: 'analyst_memo' } });
    // Language stays at the user's last explicit choice (en), not the
    // analyst_memo auto-default.
    expect(language.value).toBe('en');
  });

  it('posts persona + language to /forecast/briefing on submit', async () => {
    const spy = vi.spyOn(apiClient, 'postJson');
    render(withProviders(<BriefingButton />));
    fireEvent.click(screen.getByTestId('briefing-open'));
    fireEvent.change(screen.getByTestId('briefing-persona'), {
      target: { value: 'manuel_1pager' },
    });
    // Manuel auto-flipped to de; submit.
    fireEvent.click(screen.getByTestId('briefing-submit'));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [path, body] = spy.mock.calls[0];
    expect(path).toBe('/forecast/briefing');
    expect(body).toMatchObject({
      persona: 'manuel_1pager',
      language: 'de',
      output_format: 'pdf',
      recipient: 'self',
    });
  });
});
