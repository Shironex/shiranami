import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Track } from '@/stores/types';

import QueuePanel from './QueuePanel';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const playbackState = vi.hoisted(() => ({
  queue: [] as Track[],
  queueIndex: -1,
  currentTrack: null as Track | null,
  isPlaying: false,
  setQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  clearQueue: vi.fn(),
  togglePlay: vi.fn(),
}));

vi.mock('@/stores/usePlaybackStore', () => {
  const hook = <T,>(selector: (s: typeof playbackState) => T) => selector(playbackState);
  return { usePlaybackStore: Object.assign(hook, { getState: () => playbackState }) };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${opts.count}` : key,
  }),
}));

function setQueueState(tracks: Track[], index: number): void {
  playbackState.queue = tracks;
  playbackState.queueIndex = index;
  playbackState.currentTrack = tracks[index] ?? null;
  playbackState.isPlaying = index >= 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  setQueueState([], -1);
});

describe('QueuePanel', () => {
  it('shows the empty state when the queue is empty', () => {
    setQueueState([], -1);
    render(<QueuePanel />);

    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.queryByText('clear')).not.toBeInTheDocument();
  });

  it('renders the now-playing track and up-next rows with a count', () => {
    setQueueState(
      [
        makeTrack({ id: 'q0', title: 'Now' }),
        makeTrack({ id: 'q1', title: 'Next A' }),
        makeTrack({ id: 'q2', title: 'Next B' }),
      ],
      0
    );
    render(<QueuePanel />);

    // `nowPlaying` renders twice (section heading + sr-only active-row label).
    expect(screen.getAllByText('nowPlaying').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Next A')).toBeInTheDocument();
    expect(screen.getByText('Next B')).toBeInTheDocument();
    // upNext label carries the remaining-count interpolation.
    expect(screen.getByText('upNext:2')).toBeInTheDocument();
  });

  it('clears the queue from the header action', async () => {
    setQueueState([makeTrack({ id: 'q0', title: 'Now' })], 0);
    render(<QueuePanel />);

    await userEvent.click(screen.getByText('clear'));
    expect(playbackState.clearQueue).toHaveBeenCalledOnce();
  });

  it('renders the header action passed via props', () => {
    setQueueState([makeTrack()], 0);
    render(<QueuePanel headerAction={<button>Close panel</button>} />);

    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
  });
});
