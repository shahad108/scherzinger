import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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
