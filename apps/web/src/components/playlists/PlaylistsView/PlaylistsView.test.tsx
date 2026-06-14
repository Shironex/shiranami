import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Playlist } from '@/types/electron';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistsView from './PlaylistsView';

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'pl-1',
    name: 'Late-night focus',
    description: undefined,
    coverArt: undefined,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function renderWithClient(client: QueryClient, ui: ReactElement): void {
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function renderView(playlists?: Playlist[]): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (playlists) {
    client.setQueryData(playlistKeys.all, playlists);
  }
  renderWithClient(client, <PlaylistsView />);
}

describe('PlaylistsView', () => {
  it('holds the loading skeleton before the list query settles', () => {
    // No seeded data — the query is in-flight on first render.
    renderView();

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows the empty state once loaded with no playlists', () => {
    renderView([]);

    expect(screen.getByText('No playlists yet')).toBeInTheDocument();
  });

  it('renders the header and a card per playlist', () => {
    renderView([
      makePlaylist({ id: 'a', name: 'Late-night focus' }),
      makePlaylist({ id: 'b', name: 'Rainy day cafe' }),
    ]);

    expect(screen.getByText('Your playlists')).toBeInTheDocument();
    expect(screen.getByText('Late-night focus')).toBeInTheDocument();
    expect(screen.getByText('Rainy day cafe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Playlist/ })).toBeInTheDocument();
  });
});
