import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '@/types/electron';

import PlaylistContextMenu from './PlaylistContextMenu';

const playlist: Playlist = {
  id: 'p1',
  name: 'Late night',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderMenu(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlaylistContextMenu playlist={playlist} position={{ x: 10, y: 10 }} onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('PlaylistContextMenu', () => {
  it('renders the Open / Play / Shuffle actions', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Open Playlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Playlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shuffle Playlist' })).toBeInTheDocument();
  });
});
