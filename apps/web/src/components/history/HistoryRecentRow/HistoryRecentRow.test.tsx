import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListeningHistoryEntry } from '@/types/electron';

import HistoryRecentRow from './HistoryRecentRow';

function makeEntry(overrides: Partial<ListeningHistoryEntry> = {}): ListeningHistoryEntry {
  return {
    id: 'entry-1',
    trackId: 'track-1',
    title: 'Rainy day cafe',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    duration: 198,
    playedAt: new Date(0).toISOString(),
    playedSeconds: 198,
    completionRatio: 1,
    completed: true,
    source: 'library',
    ...overrides,
  };
}

describe('HistoryRecentRow', () => {
  it('renders the title and the "artist / album" subtitle', () => {
    render(<HistoryRecentRow entry={makeEntry()} onPlay={vi.fn()} />);

    expect(screen.getByText('Rainy day cafe')).toBeInTheDocument();
    expect(screen.getByText('Lofi Collective / Late Nights')).toBeInTheDocument();
  });

  it('calls onPlay with the track id when clicked', () => {
    const onPlay = vi.fn();
    render(<HistoryRecentRow entry={makeEntry({ trackId: 'abc' })} onPlay={onPlay} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onPlay).toHaveBeenCalledWith('abc');
  });
});
