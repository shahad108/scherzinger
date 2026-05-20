// Pricing Studio v3 / Phase 11 — KeyboardCheatSheet tests.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KeyboardCheatSheet } from '../KeyboardCheatSheet';

describe('KeyboardCheatSheet', () => {
  it('does not render content when closed', () => {
    render(<KeyboardCheatSheet open={false} onOpenChange={() => {}} />);
    expect(screen.queryByTestId('keyboard-cheat-sheet')).toBeNull();
  });

  it('renders shortcut rows when open', () => {
    render(<KeyboardCheatSheet open={true} onOpenChange={() => {}} />);
    expect(screen.getByTestId('keyboard-cheat-sheet')).toBeInTheDocument();
    expect(screen.getByText('Next SKU')).toBeInTheDocument();
    expect(screen.getByText('Save proposal')).toBeInTheDocument();
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();
  });
});
