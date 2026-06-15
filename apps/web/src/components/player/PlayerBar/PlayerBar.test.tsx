import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import PlayerBar from './PlayerBar';

// The center/seek/volume player children carry their own playback-engine wiring,
// canvases, and IPC — out of scope for the bar's own chrome. Stub them.
vi.mock('../PlayerControls', () => ({ PlayerControls: () => <div data-testid="controls" /> }));
vi.mock('../SeekBar', () => ({ SeekBar: () => <div data-testid="seekbar" /> }));
vi.mock('../WaveformSeekbar', () => ({ WaveformSeekbar: () => <div data-testid="waveform" /> }));
vi.mock('../VolumeControl', () => ({ VolumeControl: () => <div data-testid="volume" /> }));
vi.mock('../SleepTimer', () => ({ SleepTimer: () => <div data-testid="sleep" /> }));
vi.mock('../EqualizerPanel', () => ({ EqualizerPanel: () => <div data-testid="eq" /> }));
vi.mock('../PlayerOverflowMenu', () => ({
  PlayerOverflowMenu: () => <div data-testid="overflow" />,
}));
vi.mock('../TimeDisplay', () => ({ TimeDisplay: () => <span data-testid="time" /> }));

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

function renderBar() {
  return render(
    <TooltipProvider>
      <PlayerBar />
    </TooltipProvider>
  );
}

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null, duration: 215, isPlaying: false });
  useLibraryStore.setState({ library: [] });
  useInterfaceStore.setState({
    playerAlbumArt: true,
    playerFavorite: true,
    playerTimeLabels: true,
    playerVolume: true,
    playerLyricsButton: true,
    playerQueueButton: true,
    playerSleepTimer: true,
    playerEqualizer: true,
    playerCompactButton: true,
    playerVisualizerButton: true,
    playerWaveformSeekbar: false,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('PlayerBar', () => {
  it('renders nothing when no track is playing', () => {
    const { container } = renderBar();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the track info and the favorite button when a track is playing', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    renderBar();

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.getByText('Idealism')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  });

  it('toggles the favorite flag when the heart is pressed', async () => {
    const user = userEvent.setup();
    const toggleFavorite = vi.fn();
    usePlaybackStore.setState({ currentTrack: makeTrack() });
    useLibraryStore.setState({ toggleFavorite });
    renderBar();

    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));

    expect(toggleFavorite).toHaveBeenCalledWith('track-1');
  });

  it('hides the favorite button and seek row for a radio stream', () => {
    usePlaybackStore.setState({
      currentTrack: makeTrack({ filePath: 'shiranami-radio://lofi' }),
    });
    renderBar();

    expect(screen.queryByRole('button', { name: 'Add to favorites' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('seekbar')).not.toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
