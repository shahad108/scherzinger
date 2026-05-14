import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DiagnosticsAccordionToggle } from './DiagnosticsAccordionToggle';

describe('DiagnosticsAccordionToggle', () => {
  it('hides children by default and shows count in label', () => {
    render(
      <DiagnosticsAccordionToggle count={4}>
        <div data-testid="hidden-card">card</div>
      </DiagnosticsAccordionToggle>,
    );
    expect(screen.queryByTestId('hidden-card')).toBeNull();
    expect(screen.getByText(/Show diagnostics \(4\)/i)).toBeInTheDocument();
  });

  it('reveals children when toggled', () => {
    render(
      <DiagnosticsAccordionToggle count={2}>
        <div data-testid="hidden-card">card</div>
      </DiagnosticsAccordionToggle>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('hidden-card')).toBeInTheDocument();
    expect(screen.getByText(/Hide diagnostics/i)).toBeInTheDocument();
  });
});
