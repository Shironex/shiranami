import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';

import LibraryAnalysisCard from './LibraryAnalysisCard';

let nextId = 0;
function makeTrack(overrides: Partial<Track> = {}): Track {
  nextId += 1;
  return {
    id: `t${nextId}`,
    title: `Track ${nextId}`,
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: `/music/${nextId}.mp3`,
    isFavorite: false,
    bpm: null,
    musicalKey: null,
    ...overrides,
  };
}

function resetStores(): void {
  useLibraryStore.setState({ library: [], libraryLoaded: true });
}

/** The v2 mock always provides `analysis`; the contract types it optional. */
function analyzeMock() {
  const analysis = window.electronAPI.analysis;
  if (!analysis) throw new Error('the test mock must provide the analysis namespace');
  return vi.mocked(analysis.analyze);
}

beforeEach(resetStores);
afterEach(resetStores);

describe('LibraryAnalysisCard', () => {
  it('renders the coverage line and the run affordance', () => {
    useLibraryStore.setState({
      library: [makeTrack({ bpm: 80, musicalKey: 'C major' }), makeTrack()],
    });

    render(<LibraryAnalysisCard />);

    expect(screen.getByText('Tempo and key')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 tracks carry tempo and key estimates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze library/ })).toBeEnabled();
  });

  it('submits only the pending, non-radio tracks', async () => {
    const analyze = analyzeMock();
    analyze.mockClear();
    analyze.mockResolvedValueOnce({ analyzed: 1, skipped: 0, failed: 0 });
    const pending = makeTrack({ filePath: '/music/pending.mp3' });
    useLibraryStore.setState({
      library: [
        makeTrack({ bpm: 80, musicalKey: 'C major' }),
        pending,
        makeTrack({ filePath: 'shiranami-radio://lofi' }),
      ],
    });

    render(<LibraryAnalysisCard />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze library/ }));

    await vi.waitFor(() => {
      expect(analyze).toHaveBeenCalledWith([
        { id: pending.id, filePath: '/music/pending.mp3', title: pending.title },
      ]);
    });
  });

  it('shows the complete state and disables the run button', () => {
    useLibraryStore.setState({
      library: [
        makeTrack({ bpm: 74, musicalKey: 'F major' }),
        // A radio pseudo-track must not count against coverage.
        makeTrack({ filePath: 'shiranami-radio://lofi' }),
      ],
    });

    render(<LibraryAnalysisCard />);

    expect(screen.getByText('Every track carries its tempo and key estimates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze library/ })).toBeDisabled();
  });
});
