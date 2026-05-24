import { render, screen, fireEvent } from '@testing-library/react';
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

  // Regression: the slider role used to be keyboard-dead (only onPointerDown),
  // so keyboard / switch users could not seek the playing track at all.
  describe('keyboard operability', () => {
    beforeEach(() => {
      playbackState.currentTime = 50;
    });

    it('Arrow keys seek by the small step', () => {
      render(<SeekBar />);
      const slider = screen.getByRole('slider');
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(55);
      fireEvent.keyDown(slider, { key: 'ArrowUp' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(55);
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(45);
    });

    it('PageUp / PageDown seek by the larger step', () => {
      render(<SeekBar />);
      const slider = screen.getByRole('slider');
      fireEvent.keyDown(slider, { key: 'PageUp' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(60);
      fireEvent.keyDown(slider, { key: 'PageDown' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(40);
    });

    it('Home and End jump to the bounds', () => {
      render(<SeekBar />);
      const slider = screen.getByRole('slider');
      fireEvent.keyDown(slider, { key: 'Home' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(0);
      fireEvent.keyDown(slider, { key: 'End' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(100);
    });

    it('clamps to [0, duration] and ignores unrelated keys', () => {
      playbackState.currentTime = 3;
      render(<SeekBar />);
      const slider = screen.getByRole('slider');
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(0);
      playbackState.seek.mockClear();
      fireEvent.keyDown(slider, { key: 'Enter' });
      expect(playbackState.seek).not.toHaveBeenCalled();
    });
  });
});
