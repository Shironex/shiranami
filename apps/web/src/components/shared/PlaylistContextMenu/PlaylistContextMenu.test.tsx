import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '@/types/electron';
import { useViewStore } from '@/stores/useViewStore';

import PlaylistContextMenu from './PlaylistContextMenu';

const playlist: Playlist = {
  id: 'p1',
  name: 'Late night',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderMenu(onClose: () => void = vi.fn()): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlaylistContextMenu playlist={playlist} position={{ x: 10, y: 10 }} onClose={onClose} />
    </QueryClientProvider>
  );
}

describe('PlaylistContextMenu', () => {
  it('renders a menu with the Open / Play / Shuffle actions', () => {
    renderMenu();

    expect(screen.getByRole('menu', { name: 'Playlist actions' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Open Playlist' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Play Playlist' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Shuffle Playlist' })).toBeInTheDocument();
  });

  it('navigates to the playlist and closes when Open Playlist is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderMenu(onClose);

    await user.click(screen.getByRole('menuitem', { name: 'Open Playlist' }));

    expect(useViewStore.getState().activeView).toBe('playlists');
    expect(onClose).toHaveBeenCalled();
  });
});
