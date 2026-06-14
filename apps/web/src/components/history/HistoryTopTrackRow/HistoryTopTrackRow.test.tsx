import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListeningStatsTrack } from '@/types/electron';

import HistoryTopTrackRow from './HistoryTopTrackRow';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 4200,
    lastPlayedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('HistoryTopTrackRow', () => {
  it('renders the track title, artist, and play count', () => {
    render(<HistoryTopTrackRow track={makeTrack()} onPlay={vi.fn()} />);

    expect(screen.getByText('Midnight study session')).toBeInTheDocument();
    expect(screen.getByText('Lofi Collective')).toBeInTheDocument();
    expect(screen.getByText('12 plays')).toBeInTheDocument();
  });

  it('calls onPlay with the track id when clicked', () => {
    const onPlay = vi.fn();
    render(<HistoryTopTrackRow track={makeTrack({ trackId: 'abc' })} onPlay={onPlay} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onPlay).toHaveBeenCalledWith('abc');
  });
});
