import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '@/types/electron';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistPickerContent from './PlaylistPickerContent';

function makePlaylist(id: string, name: string): Playlist {
  return {
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderPicker(ui: ReactElement, playlists: Playlist[], memberIds: string[]): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(playlistKeys.all, playlists);
  client.setQueryData([...playlistKeys.all, 'membership', ['t1']], memberIds);
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('PlaylistPickerContent', () => {
  it('lists the seeded playlists and the create-new affordance', () => {
    renderPicker(
      <PlaylistPickerContent trackIds={['t1']} onDone={vi.fn()} />,
      [makePlaylist('p1', 'Late night'), makePlaylist('p2', 'Focus flow')],
      ['p1']
    );

    expect(screen.getByText('Late night')).toBeInTheDocument();
    expect(screen.getByText('Focus flow')).toBeInTheDocument();
    expect(screen.getByText('New Playlist')).toBeInTheDocument();
  });

  it('shows the empty hint when there are no playlists', () => {
    renderPicker(<PlaylistPickerContent trackIds={['t1']} onDone={vi.fn()} />, [], []);

    expect(screen.getByText('No playlists')).toBeInTheDocument();
  });
});
