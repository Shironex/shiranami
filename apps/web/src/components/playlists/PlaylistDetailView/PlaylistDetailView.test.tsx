import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Playlist } from '@/types/electron';
import type { Track } from '@/stores/types';
import { useViewStore } from '@/stores/useViewStore';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistDetailView from './PlaylistDetailView';

const PLAYLIST_ID = 'pl-1';

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: PLAYLIST_ID,
    name: 'Late-night focus',
    description: undefined,
    coverArt: undefined,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

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

function renderWithClient(client: QueryClient, ui: ReactElement): void {
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function renderView(opts: { playlist?: Playlist; tracks?: Track[] } = {}): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (opts.playlist) {
    client.setQueryData(playlistKeys.detail(PLAYLIST_ID), opts.playlist);
  }
  if (opts.tracks) {
    client.setQueryData(playlistKeys.tracks(PLAYLIST_ID), opts.tracks);
  }
  renderWithClient(client, <PlaylistDetailView />);
}

beforeEach(() => {
  useViewStore.getState().selectPlaylist(PLAYLIST_ID);
});

afterEach(() => {
  useViewStore.getState().selectPlaylist(null);
});

describe('PlaylistDetailView', () => {
  it('renders the header and the empty track state for a playlist with no tracks', () => {
    renderView({ playlist: makePlaylist({ name: 'Rainy day cafe' }), tracks: [] });

    expect(screen.getByText('Rainy day cafe')).toBeInTheDocument();
    expect(screen.getByText('No tracks yet')).toBeInTheDocument();
  });

  it('renders the header subtitle with the track count when tracks are present', () => {
    renderView({
      playlist: makePlaylist(),
      tracks: [makeTrack({ id: 'a' }), makeTrack({ id: 'b' })],
    });

    expect(screen.getByText(/2 tracks/)).toBeInTheDocument();
    expect(screen.getByText('Play All')).toBeInTheDocument();
  });
});
