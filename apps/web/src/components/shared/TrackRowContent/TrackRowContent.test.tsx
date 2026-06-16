import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type Track } from '@/stores/types';
import TrackRowContent from './TrackRowContent';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/shared/TrackContextMenu', () => ({
  TrackContextMenu: () => <div data-testid="context-menu" />,
}));

vi.mock('@/components/shared/AddToPlaylistButton', () => ({
  AddToPlaylistButton: ({ trackId }: { trackId: string }) => (
    <button data-testid={`add-to-playlist-${trackId}`}>Add</button>
  ),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    albumArt: 'https://example.com/art.jpg',
    isFavorite: false,
    ...overrides,
  };
}

describe('TrackRowContent', () => {
  it('renders the track title, artist, and formatted duration', () => {
    const track = makeTrack();
    render(
      <TrackRowContent
        track={track}
        index={0}
        queue={[track]}
        currentTrack={null}
        isPlaying={false}
        handlePlayTrack={vi.fn()}
      />
    );

    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    // 215s -> 3:35
    expect(screen.getByText('3:35')).toBeInTheDocument();
  });
});
