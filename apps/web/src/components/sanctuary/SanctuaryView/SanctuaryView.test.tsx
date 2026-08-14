import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import SanctuaryView from './SanctuaryView';

// The cross-feature player children pull in engine wiring, canvases, and IPC
// that are out of scope for the composition shell's tests.
vi.mock('@/components/player/PlayerControls', () => ({ PlayerControls: () => null }));
vi.mock('@/components/player/SeekBar', () => ({ SeekBar: () => null }));
vi.mock('@/components/player/WaveformSeekbar', () => ({ WaveformSeekbar: () => null }));
vi.mock('@/components/player/TimeDisplay', () => ({ TimeDisplay: () => null }));

// Deterministic lyrics: one active line so the focus text is assertable.
vi.mock('@/hooks/useLyricsView', () => ({
  useLyricsView: () => ({
    synced: [
      { time: 0, text: 'first line' },
      { time: 10, text: 'the active line' },
    ],
    plain: null,
    source: null,
    activeLine: 1,
    isLoading: false,
    isError: false,
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
  useSanctuaryStore.setState({
    sanctuaryActive: false,
    sanctuaryAutoEntered: false,
    sanctuaryVariant: 'cover',
  });
}

beforeEach(reset);
afterEach(reset);

describe('SanctuaryView', () => {
  it('renders nothing when no track is playing', () => {
    const { container } = renderView(<SanctuaryView />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the cover variant with the active lyric line', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useSanctuaryStore.setState({ sanctuaryActive: true });

    renderView(<SanctuaryView />);

    expect(screen.getByRole('heading', { name: 'Midnight Tapes' })).toBeInTheDocument();
    expect(screen.getByText('the active line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Sanctuary' })).toBeInTheDocument();
  });

  it('cycles cover → clock → vinyl → cover through the toggle', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useSanctuaryStore.setState({ sanctuaryActive: true });

    renderView(<SanctuaryView />);

    fireEvent.click(screen.getByRole('button', { name: 'Show the clock' }));
    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('clock');

    fireEvent.click(screen.getByRole('button', { name: 'Show the record' }));
    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('vinyl');

    fireEvent.click(screen.getByRole('button', { name: 'Show the cover' }));
    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('cover');
  });

  it('renders the vinyl center stage with the track info', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useSanctuaryStore.setState({ sanctuaryActive: true, sanctuaryVariant: 'vinyl' });

    renderView(<SanctuaryView />);

    expect(document.querySelector('[data-slot="vinyl-record"]')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Midnight Tapes' })).toBeInTheDocument();
    expect(screen.getByText('the active line')).toBeInTheDocument();
  });

  it('exits through the leave button', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useSanctuaryStore.setState({ sanctuaryActive: true });

    renderView(<SanctuaryView />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave Sanctuary' }));

    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);
  });

  it('an auto-entered sanctuary exits on pointer movement', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useSanctuaryStore.setState({ sanctuaryActive: true, sanctuaryAutoEntered: true });

    renderView(<SanctuaryView />);

    fireEvent.pointerMove(window);

    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);
  });

  it('a deliberately-entered sanctuary stays up on pointer movement', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215 });
    useSanctuaryStore.setState({ sanctuaryActive: true, sanctuaryAutoEntered: false });

    renderView(<SanctuaryView />);

    fireEvent.pointerMove(window);

    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(true);
  });
});
