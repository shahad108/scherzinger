import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DataMissingBadge } from './DataMissingBadge';

describe('DataMissingBadge', () => {
  it('renders default copy', () => {
    render(<DataMissingBadge />);
    expect(screen.getByTestId('data-missing-badge')).toHaveTextContent(/data missing/i);
  });

  it('renders custom reason text', () => {
    render(<DataMissingBadge reason="No sample" />);
    expect(screen.getByTestId('data-missing-badge')).toHaveTextContent('No sample');
  });

  it('uses tooltip prop as native title attribute', () => {
    render(<DataMissingBadge reason="No sample" tooltip="Sample size below 5" />);
    expect(screen.getByTestId('data-missing-badge')).toHaveAttribute(
      'title',
      'Sample size below 5',
    );
  });
});
