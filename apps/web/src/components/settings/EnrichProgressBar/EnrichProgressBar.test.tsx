import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';

import EnrichProgressBar from './EnrichProgressBar';

function reset(): void {
  useMetadataEnrichStore.setState({ isEnriching: false, isCancelling: false, progress: null });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('EnrichProgressBar', () => {
  it('renders nothing when no run is active', () => {
    const { container } = render(<EnrichProgressBar />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the progress count while a run is active', () => {
    useMetadataEnrichStore.setState({
      isEnriching: true,
      progress: { current: 3, total: 12, trackName: 'feels.mp3', status: 'searching' },
    });
    render(<EnrichProgressBar />);

    expect(screen.getByText('Processing 3 of 12...')).toBeInTheDocument();
  });

  it('shows the confidence badge on a done event', () => {
    useMetadataEnrichStore.setState({
      isEnriching: true,
      progress: {
        current: 8,
        total: 12,
        trackName: 'Modal Soul',
        status: 'done',
        confidence: 0.92,
      },
    });
    render(<EnrichProgressBar />);

    expect(screen.getByText('Strong match')).toBeInTheDocument();
  });
});
