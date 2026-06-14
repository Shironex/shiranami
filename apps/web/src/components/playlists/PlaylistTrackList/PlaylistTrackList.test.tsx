import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';

import PlaylistTrackList from './PlaylistTrackList';
import type { IPlaylistTrackListProps } from './PlaylistTrackList.types';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function renderList(overrides: Partial<IPlaylistTrackListProps> = {}) {
  const tracks = overrides.displayTracks ?? [makeTrack()];
  const props: IPlaylistTrackListProps = {
    displayTracks: tracks,
    sortableIds: tracks.map(t => t.id),
    activeTrack: null,
    currentTrack: null,
    isPlaying: false,
    sensors: [],
    onDragStart: () => {},
    onDragEnd: () => {},
    onDragCancel: () => {},
    onPlayTrack: () => {},
    onToggleFavorite: () => {},
    onRemoveTrack: () => {},
    ...overrides,
  };
  return render(<PlaylistTrackList {...props} />);
}

describe('PlaylistTrackList', () => {
  it('renders the empty state when there are no tracks', () => {
    renderList({ displayTracks: [], sortableIds: [] });

    expect(screen.getByText('No tracks yet')).toBeInTheDocument();
  });

  it('renders the virtualized list when there are tracks', () => {
    const { container } = renderList({
      displayTracks: [makeTrack({ id: 'a', title: 'First' })],
      sortableIds: ['a'],
    });

    // The react-window list mounts inside the glass panel container.
    expect(container.querySelector('.glass-panel')).not.toBeNull();
    expect(screen.queryByText('No tracks yet')).toBeNull();
  });
});
