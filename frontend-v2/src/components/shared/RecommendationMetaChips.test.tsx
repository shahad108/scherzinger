import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecommendationMetaChips } from './RecommendationMetaChips';

describe('RecommendationMetaChips', () => {
  it('renders every chip when all props are populated', () => {
    render(
      <RecommendationMetaChips
        cluster="C7"
        clusterConfidence={82}
        sampleSize={34}
        modelId="recommender"
        modelVersion="3.2.0"
        trainedAt="2026-05-01T08:30:00Z"
      />,
    );
    const root = screen.getByTestId('recommendation-meta-chips');
    expect(root).toBeInTheDocument();
    expect(screen.getByTestId('rmc-cluster')).toHaveTextContent('Cluster C7');
    expect(screen.getByTestId('rmc-conf')).toHaveTextContent('82% conf');
    expect(screen.getByTestId('rmc-n')).toHaveTextContent('n=34');
    expect(screen.getByTestId('rmc-model')).toHaveTextContent('recommender v3.2.0');
    expect(screen.getByTestId('rmc-trained')).toHaveTextContent('trained 2026-05-01');
    expect(screen.queryByTestId('rmc-stale')).not.toBeInTheDocument();
  });

  it('skips chips for missing props gracefully', () => {
    render(<RecommendationMetaChips cluster="A1" />);
    expect(screen.getByTestId('rmc-cluster')).toHaveTextContent('Cluster A1');
    expect(screen.queryByTestId('rmc-conf')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rmc-n')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rmc-model')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rmc-trained')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rmc-stale')).not.toBeInTheDocument();
  });

  it('renders the stale chip when stale is true', () => {
    render(
      <RecommendationMetaChips cluster="C7" clusterConfidence={50} stale />,
    );
    expect(screen.getByTestId('rmc-stale')).toHaveTextContent(/stale/i);
  });

  it('returns null when nothing meaningful is provided', () => {
    const { container } = render(
      <RecommendationMetaChips sampleSize={null} modelVersion={null} trainedAt={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
