import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LockedBlock } from './LockedBlock';

describe('LockedBlock (shared)', () => {
  it('renders the title prop', () => {
    render(<LockedBlock title="Competitor price signal" />);
    const block = screen.getByTestId('ac-locked-block');
    expect(block).toBeInTheDocument();
    expect(block).toHaveAttribute('data-title', 'Competitor price signal');
    expect(block).toHaveTextContent('Competitor price signal');
  });

  it('renders the hint prop when provided', () => {
    render(
      <LockedBlock
        title="ERP price push"
        hint="Unlocks once SAP-PI write-back is contracted (Roadmap §8.4 — Locked)"
      />,
    );
    expect(
      screen.getByText(/SAP-PI write-back is contracted/i),
    ).toBeInTheDocument();
  });

  it('renders the traceId prop when provided', () => {
    render(<LockedBlock title="Contract status" traceId="trace-abc-123" />);
    expect(screen.getByText(/Trace ID:/i)).toBeInTheDocument();
    expect(screen.getByText('trace-abc-123')).toBeInTheDocument();
  });

  it('omits hint and traceId blocks when not provided', () => {
    render(<LockedBlock title="Bare title" />);
    expect(screen.queryByText(/Trace ID:/i)).not.toBeInTheDocument();
    // The standard "Locked — data source not yet connected." copy is always
    // rendered; absence of hint just means there's no extra paragraph.
    expect(
      screen.getByText('Locked — data source not yet connected.'),
    ).toBeInTheDocument();
  });
});
