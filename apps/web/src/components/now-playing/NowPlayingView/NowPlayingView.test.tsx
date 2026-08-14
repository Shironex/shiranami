import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import NowPlayingView from './NowPlayingView';

// The cross-feature player + lyrics children pull in playback engine wiring,
// canvases, and IPC that are out of scope for the composition shell's tests.
// Stub them with markers so the shell's own structure is what's asserted.
vi.mock('@/components/lyrics/LyricsBody', () => ({
  LyricsBody: () => <div data-testid="lyrics-body" />,
}));
vi.mock('@/components/player/QueuePanel', () => ({
  QueuePanel: () => <div data-testid="queue-panel" />,
}));
vi.mock('@/components/player/EqualizerPanel', () => ({
  EqualizerPanel: () => <div data-testid="eq-panel" />,
}));
vi.mock('@/components/player/PlayerControls', () => ({ PlayerControls: () => null }));
vi.mock('@/components/player/SeekBar', () => ({ SeekBar: () => null }));
vi.mock('@/components/player/WaveformSeekbar', () => ({ WaveformSeekbar: () => null }));
vi.mock('@/components/player/VolumeControl', () => ({ VolumeControl: () => null }));
vi.mock('@/components/player/TimeDisplay', () => ({ TimeDisplay: () => null }));

// The lyrics data layer needs no network in these tests — return an empty result.
vi.mock('@/hooks/useLyricsView', () => ({
  useLyricsView: () => ({
    synced: null,
    plain: null,
    source: null,
    activeLine: -1,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
    handleLineClick: vi.fn(),
  }),
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

function renderView(ui: ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null, duration: 0, isPlaying: false });
  useUIStore.setState({ nowPlayingPanel: 'lyrics', vinylDisplayEnabled: false });
  useViewStore.setState({ activeView: 'now-playing', previousView: 'library' });
}

beforeEach(reset);
afterEach(reset);

describe('NowPlayingView', () => {
  it('renders nothing when no track is playing', () => {
    const { container } = renderView(<NowPlayingView />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the track info and the active lyrics panel', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useUIStore.setState({ nowPlayingPanel: 'lyrics' });

    renderView(<NowPlayingView />);

    expect(screen.getByText('Midnight Tapes')).toBeInTheDocument();
    expect(screen.getByText(/Idealism/)).toBeInTheDocument();
    expect(screen.getByTestId('lyrics-body')).toBeInTheDocument();
  });

  it('shows the tempo and key estimates when the track carries them', () => {
    usePlaybackStore.setState({
      currentTrack: makeTrack({ bpm: 81.6, musicalKey: 'A minor' }),
      duration: 215,
    });

    renderView(<NowPlayingView />);

    expect(screen.getByText('≈ 82 BPM · A minor')).toBeInTheDocument();
  });

  it('omits the estimate line for an unanalysed track', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });

    renderView(<NowPlayingView />);

    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
  });

  it('swaps the album-art card for the vinyl record when the display is enabled', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useUIStore.setState({ vinylDisplayEnabled: true });

    renderView(<NowPlayingView />);

    expect(document.querySelector('[data-slot="vinyl-record"]')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Late Nights' })).not.toBeInTheDocument();
  });

  it('keeps the album-art card when the vinyl display is off', () => {
    usePlaybackStore.setState({
      currentTrack: makeTrack({ albumArt: 'art://cover.jpg' }),
      duration: 215,
    });

    renderView(<NowPlayingView />);

    expect(document.querySelector('[data-slot="vinyl-record"]')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Late Nights' })).toBeInTheDocument();
  });

  it('switches the active panel when a toggle is pressed', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useUIStore.setState({ nowPlayingPanel: 'lyrics' });

    renderView(<NowPlayingView />);
    expect(screen.queryByTestId('queue-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show queue' }));

    // The toggle drives the shared UI store; the queue toggle now reads as the
    // active (pressed) panel. (The mounted panel itself swaps behind an
    // AnimatePresence wait-mode transition, which jsdom does not advance.)
    expect(useUIStore.getState().nowPlayingPanel).toBe('queue');
    expect(screen.getByRole('button', { name: 'Hide queue' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('hides the panel when the active toggle is pressed again', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useUIStore.setState({ nowPlayingPanel: 'lyrics' });

    renderView(<NowPlayingView />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide lyrics' }));

    expect(useUIStore.getState().nowPlayingPanel).toBeNull();
    expect(screen.getByRole('button', { name: 'Show lyrics' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
