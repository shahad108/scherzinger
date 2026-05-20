import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WtpBandStrip } from '../WtpBandStrip';
import { renderWithLineage } from './test-utils';
import { wtp } from './fixtures';

describe('WtpBandStrip', () => {
  it('renders DataMissingBadge when wtp block is missing', () => {
    renderWithLineage(<WtpBandStrip wtp={null} />);
    expect(screen.getByTestId('data-missing-badge')).toHaveTextContent(/WTP/i);
  });

  it('renders p10 / p50 / p90 marker labels when wtp is provided', () => {
    renderWithLineage(<WtpBandStrip wtp={wtp()} recommendedPrice="127.00" />);
    expect(screen.getByTestId('wtp-band-strip')).toBeInTheDocument();
    expect(screen.getByText('p10')).toBeInTheDocument();
    expect(screen.getByText('p50')).toBeInTheDocument();
    expect(screen.getByText('p90')).toBeInTheDocument();
    expect(screen.getByText('rec')).toBeInTheDocument();
  });

  it('renders the cluster-anchored chip when the BFF flag is true', () => {
    renderWithLineage(
      <WtpBandStrip wtp={wtp({ anchored_from_cluster: true })} recommendedPrice="127.00" />,
    );
    expect(screen.getByText(/cluster anchor/i)).toBeInTheDocument();
  });

  it('shows a "single point" badge when p10 == p50 == p90 (degenerate)', () => {
    renderWithLineage(
      <WtpBandStrip
        wtp={wtp({ p10: '120.00', p50: '120.00', p90: '120.00' })}
        recommendedPrice={null}
      />,
    );
    // The strip header still renders, but the body collapses to the badge.
    expect(screen.getByText(/Single point/i)).toBeInTheDocument();
  });
});
