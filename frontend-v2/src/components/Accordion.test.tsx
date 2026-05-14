import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Accordion } from './Accordion';

describe('Accordion', () => {
  it('defaults to closed and toggles open on click, updating aria-expanded', () => {
    render(
      <Accordion title="Drivers & accuracy">
        <div data-testid="inner">hello</div>
      </Accordion>,
    );

    const button = screen.getByRole('button', { name: /Drivers & accuracy/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('inner')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('inner')).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('inner')).not.toBeInTheDocument();
  });

  it('respects defaultOpen=true', () => {
    render(
      <Accordion title="Open by default" defaultOpen>
        <div data-testid="inner">visible</div>
      </Accordion>,
    );
    const button = screen.getByRole('button', { name: /Open by default/i });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('renders a badge when provided', () => {
    render(
      <Accordion title="With badge" badge="3 active">
        <div>body</div>
      </Accordion>,
    );
    expect(screen.getByTestId('accordion-badge')).toHaveTextContent('3 active');
  });

  it('opens on a matching `accordion:open` window event (deep-link)', () => {
    render(
      <Accordion title="Renewals" id="block-renewals">
        <div data-testid="inner">renewals content</div>
      </Accordion>,
    );
    const button = screen.getByRole('button', { name: /Renewals/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('accordion:open', { detail: { id: 'block-renewals' } }),
      );
    });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('ignores `accordion:open` events targeted at a different id', () => {
    render(
      <Accordion title="Other" id="block-other">
        <div data-testid="inner">other</div>
      </Accordion>,
    );
    const button = screen.getByRole('button', { name: /Other/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('accordion:open', { detail: { id: 'block-renewals' } }),
      );
    });
    // Still closed — id did not match.
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports controlled `open` + `onOpenChange`', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Accordion title="Controlled" open={false} onOpenChange={onOpenChange}>
        <div data-testid="inner">x</div>
      </Accordion>,
    );
    const button = screen.getByRole('button', { name: /Controlled/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // Open state stays false because we didn't re-render with a new prop.
    expect(button).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <Accordion title="Controlled" open onOpenChange={onOpenChange}>
        <div data-testid="inner">x</div>
      </Accordion>,
    );
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles on Enter and Space keys for accessibility', () => {
    render(
      <Accordion title="Keyboard">
        <div data-testid="inner">k</div>
      </Accordion>,
    );
    const button = screen.getByRole('button', { name: /Keyboard/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(button, { key: ' ' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
