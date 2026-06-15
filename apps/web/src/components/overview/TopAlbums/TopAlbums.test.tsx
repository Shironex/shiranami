import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ListeningAlbumStat } from '@/types/electron';

import TopAlbums from './TopAlbums';

function makeAlbum(overrides: Partial<ListeningAlbumStat> = {}): ListeningAlbumStat {
  return {
    album: 'Midnight Tapes',
    artist: 'Idealism',
    albumArt: null,
    playCount: 24,
    ...overrides,
  };
}

describe('TopAlbums', () => {
  it('shows the empty copy when there are no albums', () => {
    render(<TopAlbums albums={[]} />);

    expect(screen.getByText(/most-spun albums/)).toBeInTheDocument();
  });

  it('renders each album with its play-count label', () => {
    render(
      <TopAlbums
        albums={[makeAlbum({ playCount: 24 }), makeAlbum({ album: 'Rainy Days', playCount: 1 })]}
      />
    );

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.getByText('24 plays')).toBeInTheDocument();
    expect(screen.getByText('1 play')).toBeInTheDocument();
  });

  it('falls back to the unknown-artist label when an artist is missing', () => {
    render(<TopAlbums albums={[makeAlbum({ artist: '' })]} />);

    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
  });
});
