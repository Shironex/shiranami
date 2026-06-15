import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import CompactPlayer from './CompactPlayer';

// The center/seek/volume children + the lazy lyrics panel carry playback-engine
// wiring and IPC out of scope for the mini-player shell. Stub them with markers.
vi.mock('../PlayerControls', () => ({ PlayerControls: () => <div data-testid="controls" /> }));
vi.mock('../SeekBar', () => ({ SeekBar: () => <div data-testid="seekbar" /> }));
vi.mock('../VolumeControl', () => ({ VolumeControl: () => <div data-testid="volume" /> }));
vi.mock('../TimeDisplay', () => ({ TimeDisplay: () => <span data-testid="time" /> }));
vi.mock('@/components/lyrics/LyricsPanel/LyricsPanel', () => ({
  default: () => <div data-testid="lyrics-panel" />,
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function renderCompact() {
  return render(
    <TooltipProvider>
      <CompactPlayer />
    </TooltipProvider>
  );
}

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null, duration: 215, isPlaying: false });
  useLibraryStore.setState({ library: [] });
  useCompactStore.setState({
    compactShowAlbumArt: true,
    compactShowAlbum: true,
    compactShowSeek: true,
    compactShowVolume: true,
    compactShowFavorite: false,
    compactShowLyrics: false,
    compactLyricsExpanded: false,
    compactAlwaysOnTop: false,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('CompactPlayer', () => {
  it('renders the idle state when nothing is playing', () => {
    renderCompact();

    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
  });

  it('renders the current track title and artist', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    renderCompact();

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.getByText('Idealism')).toBeInTheDocument();
  });

  it('exits compact mode when the exit control is pressed', async () => {
    const user = userEvent.setup();
    const setCompactMode = vi.fn(() => Promise.resolve());
    useCompactStore.setState({ setCompactMode });
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    renderCompact();

    await user.click(screen.getByRole('button', { name: 'Exit compact mode' }));

    expect(setCompactMode).toHaveBeenCalledWith(false);
  });

  it('shows the lyrics toggle only when the lyrics setting is on', () => {
    useCompactStore.setState({ compactShowLyrics: true });
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    renderCompact();

    expect(screen.getByRole('button', { name: 'Show lyrics' })).toBeInTheDocument();
  });
});
