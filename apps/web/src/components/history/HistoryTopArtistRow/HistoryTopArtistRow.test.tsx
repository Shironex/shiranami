import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ListeningStatsArtist } from '@/types/electron';

import HistoryTopArtistRow from './HistoryTopArtistRow';

function makeArtist(overrides: Partial<ListeningStatsArtist> = {}): ListeningStatsArtist {
  return {
    artist: 'Lofi Collective',
    playCount: 28,
    listenedSeconds: 9000,
    ...overrides,
  };
}

describe('HistoryTopArtistRow', () => {
  it('renders the artist name and play count', () => {
    render(<HistoryTopArtistRow artist={makeArtist()} />);

    expect(screen.getByText('Lofi Collective')).toBeInTheDocument();
    expect(screen.getByText('28 plays')).toBeInTheDocument();
  });

  it('falls back to the localized unknown-artist label when blank', () => {
    render(<HistoryTopArtistRow artist={makeArtist({ artist: '' })} />);

    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
  });
});
