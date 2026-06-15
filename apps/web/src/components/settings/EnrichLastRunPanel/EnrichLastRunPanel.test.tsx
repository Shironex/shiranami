import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataEnrichStore, type EnrichLastRunEntry } from '@/stores/useMetadataEnrichStore';

import EnrichLastRunPanel from './EnrichLastRunPanel';

const SAMPLE: EnrichLastRunEntry[] = [
  {
    id: 'track-1',
    trackName: 'Modal Soul',
    source: 'itunes',
    confidence: 0.92,
    success: true,
    diffs: [{ field: 'artist', oldValue: 'Unknown Artist', newValue: 'Nujabes' }],
  },
];

function reset(): void {
  useMetadataEnrichStore.setState({ isEnriching: false, lastRunResults: [] });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('EnrichLastRunPanel', () => {
  it('renders nothing when there are no results', () => {
    const { container } = render(<EnrichLastRunPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while a run is in flight', () => {
    useMetadataEnrichStore.setState({ isEnriching: true, lastRunResults: SAMPLE });
    const { container } = render(<EnrichLastRunPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the collapsed summary and expands the per-track diffs on click', async () => {
    const user = userEvent.setup();
    useMetadataEnrichStore.setState({ lastRunResults: SAMPLE });
    render(<EnrichLastRunPanel />);

    const toggle = screen.getByRole('button', { name: /view last run/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Modal Soul')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Modal Soul')).toBeInTheDocument();
    expect(screen.getByText('Nujabes')).toBeInTheDocument();
  });
});
