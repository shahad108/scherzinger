import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LineageButton } from './LineageButton';
import { LineageDrawerProvider, useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { lineageRef } from '@/features/pricing-studio/components/__tests__/fixtures';

function Spy() {
  const { openLineageRef } = useLineageDrawer();
  return <span data-testid="spy">{openLineageRef?.id ?? 'none'}</span>;
}

describe('LineageButton', () => {
  it('is disabled when no lineageRef is provided', () => {
    render(
      <LineageDrawerProvider>
        <LineageButton />
      </LineageDrawerProvider>,
    );
    const btn = screen.getByTestId('lineage-button');
    expect(btn).toBeDisabled();
  });

  it('opens the lineage drawer context for the provided ref', () => {
    const ref = lineageRef('ref-id-test');
    render(
      <LineageDrawerProvider>
        <LineageButton lineageRef={ref} label="lineage" />
        <Spy />
      </LineageDrawerProvider>,
    );
    expect(screen.getByTestId('spy')).toHaveTextContent('none');
    fireEvent.click(screen.getByTestId('lineage-button'));
    expect(screen.getByTestId('spy')).toHaveTextContent('ref-id-test');
  });
});
