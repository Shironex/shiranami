import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import MetadataEnrichSection from './MetadataEnrichSection';

// Child subscribers carry their own store wiring; the section's own chrome
// (counts, options, action row) is what we exercise here.
vi.mock('@/components/settings/EnrichBeforeAfterPreview', () => ({
  EnrichBeforeAfterPreview: () => <div data-testid="before-after" />,
}));
vi.mock('@/components/settings/EnrichProgressBar', () => ({
  EnrichProgressBar: () => <div data-testid="progress" />,
}));
vi.mock('@/components/settings/EnrichLastRunPanel', () => ({
  EnrichLastRunPanel: () => <div data-testid="last-run" />,
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function renderSection() {
  return render(
    <TooltipProvider>
      <MetadataEnrichSection />
    </TooltipProvider>
  );
}

function reset(): void {
  useLibraryStore.setState({ library: [] });
  useMetadataEnrichStore.setState({
    isEnriching: false,
    isCancelling: false,
    skippedIds: new Set(),
    skippedLoaded: true,
    lastRunResults: [],
    progress: null,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('MetadataEnrichSection', () => {
  it('renders the enrich card with the experimental badge', () => {
    renderSection();

    expect(screen.getByText('Experimental')).toBeInTheDocument();
    expect(screen.getByText('File modification')).toBeInTheDocument();
  });

  it('counts tracks that have missing metadata', () => {
    useLibraryStore.setState({ library: [makeTrack(), makeTrack({ id: 'track-2' })] });
    renderSection();

    expect(screen.getByText('2 track(s) with missing metadata')).toBeInTheDocument();
  });

  it('disables the enrich button when there are no tracks needing enrichment', () => {
    renderSection();

    expect(screen.getByRole('button', { name: /find missing metadata/i })).toBeDisabled();
  });

  it('starts a DB-only run immediately when write-to-file is off', async () => {
    const user = userEvent.setup();
    const startEnrichment = vi.fn();
    useLibraryStore.setState({ library: [makeTrack()] });
    useMetadataEnrichStore.setState({ startEnrichment });
    renderSection();

    await user.click(screen.getByRole('button', { name: /find missing metadata/i }));

    expect(startEnrichment).toHaveBeenCalledWith({
      onlyMissing: true,
      writeToFile: false,
      includeSkipped: false,
    });
  });
});
