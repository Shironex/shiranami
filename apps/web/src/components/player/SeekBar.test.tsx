import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeekBar } from './SeekBar';

const playbackState = vi.hoisted(() => ({
  duration: 100,
  isPlaying: false,
  currentTime: 0,
  seek: vi.fn(),
}));

const uiState = vi.hoisted(() => ({
  scrubTime: null as number | null,
  setScrubTime: vi.fn(),
}));

vi.mock('@/stores/usePlaybackStore', () => ({
  usePlaybackStore: <T,>(selector: (s: typeof playbackState) => T) => selector(playbackState),
  currentTimeRef: { current: 0 },
}));

vi.mock('@/stores/usePlayerUIStore', () => ({
  usePlayerUIStore: <T,>(selector: (s: typeof uiState) => T) => selector(uiState),
}));

describe('SeekBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playbackState.duration = 100;
    playbackState.isPlaying = false;
    playbackState.currentTime = 0;
    playbackState.seek.mockReset();
    uiState.scrubTime = null;
    uiState.setScrubTime.mockReset();
  });

  it('updates scrub position and seeks on pointer up', async () => {
    const user = userEvent.setup();
    render(<SeekBar />);
    const track = screen.getByRole('slider');

    Object.defineProperty(track, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 200,
        height: 8,
        top: 0,
        left: 0,
        bottom: 8,
        right: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await user.pointer({
      keys: '[MouseLeft>]',
      target: track,
      coords: { clientX: 100, clientY: 4 },
    });
    expect(uiState.setScrubTime).toHaveBeenCalledWith(50);

    await user.pointer({
      keys: '[/MouseLeft]',
      target: track,
      coords: { clientX: 150, clientY: 4 },
    });
    expect(playbackState.seek).toHaveBeenCalledWith(75);
    // SeekBar now clears scrubTime explicitly on commit (used to live in the
    // store's seek() action in the pre-split monolith).
    expect(uiState.setScrubTime).toHaveBeenCalledWith(null);
  });
});
