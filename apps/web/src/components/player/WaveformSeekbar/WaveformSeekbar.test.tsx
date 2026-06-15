import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveformSeekbar } from './index';

const playbackState = vi.hoisted(() => ({
  duration: 100,
  isPlaying: false,
  currentTime: 0,
  currentTrack: { filePath: '/music/test.mp3' } as { filePath: string } | null,
  seek: vi.fn(),
}));

const uiState = vi.hoisted(() => ({
  scrubTime: null as number | null,
  setScrubTime: vi.fn(),
}));

vi.mock('@/stores/usePlaybackStore', () => {
  const hook = <T,>(selector: (s: typeof playbackState) => T) => selector(playbackState);
  return {
    usePlaybackStore: Object.assign(hook, { getState: () => playbackState }),
    currentTimeRef: { current: 0 },
  };
});

vi.mock('@/stores/usePlayerUIStore', () => {
  const hook = <T,>(selector: (s: typeof uiState) => T) => selector(uiState);
  return { usePlayerUIStore: Object.assign(hook, { getState: () => uiState }) };
});

// The waveform's drawing dependencies (native peaks IPC, canvas sizing, primary
// colour) are out of scope for the seek-contract tests — stub them inert so the
// slider behaviour is what's asserted.
vi.mock('@/hooks/useWaveformPeaks', () => ({ useWaveformPeaks: () => null }));
vi.mock('@/hooks/useRafLoop', () => ({ useRafLoop: () => {} }));
vi.mock('@/hooks/useCanvasSize', () => ({
  useCanvasSize: () => ({
    widthRef: { current: 0 },
    heightRef: { current: 0 },
    dprRef: { current: 1 },
  }),
}));
vi.mock('@/hooks/usePrimaryRGB', () => ({
  usePrimaryRGB: () => ({ rgbRef: { current: [155, 125, 235] }, versionRef: { current: 0 } }),
}));

// jsdom implements set/releasePointerCapture (via test setup) but not
// hasPointerCapture, which the drag-end cleanup calls. Stub it to false so the
// pointer-up path runs without throwing.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

function setTrackWidth(track: HTMLElement, width: number): void {
  Object.defineProperty(track, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height: 28,
      top: 0,
      left: 0,
      bottom: 28,
      right: width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

describe('WaveformSeekbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playbackState.duration = 100;
    playbackState.isPlaying = false;
    playbackState.currentTime = 0;
    playbackState.seek.mockReset();
    uiState.scrubTime = null;
    uiState.setScrubTime.mockReset();
  });

  it('renders a slider with the playback range and current position', () => {
    playbackState.currentTime = 40;
    render(<WaveformSeekbar />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '40');
  });

  it('falls back to a 100 max when duration is unknown', () => {
    playbackState.duration = 0;
    render(<WaveformSeekbar />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '100');
  });

  it('updates scrub position on drag and seeks on pointer up', async () => {
    const user = userEvent.setup();
    render(<WaveformSeekbar />);
    const track = screen.getByRole('slider');
    setTrackWidth(track, 200);

    await user.pointer({
      keys: '[MouseLeft>]',
      target: track,
      coords: { clientX: 100, clientY: 14 },
    });
    expect(uiState.setScrubTime).toHaveBeenCalledWith(50);

    await user.pointer({
      keys: '[/MouseLeft]',
      target: track,
      coords: { clientX: 150, clientY: 14 },
    });
    expect(playbackState.seek).toHaveBeenCalledWith(75);
    // The drag-end cleanup clears the scrub state.
    expect(uiState.setScrubTime).toHaveBeenLastCalledWith(null);
  });

  describe('keyboard operability', () => {
    beforeEach(() => {
      playbackState.currentTime = 50;
    });

    it('Arrow keys seek by the small step', () => {
      render(<WaveformSeekbar />);
      const slider = screen.getByRole('slider');
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(55);
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(45);
    });

    it('Home and End jump to the bounds', () => {
      render(<WaveformSeekbar />);
      const slider = screen.getByRole('slider');
      fireEvent.keyDown(slider, { key: 'Home' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(0);
      fireEvent.keyDown(slider, { key: 'End' });
      expect(playbackState.seek).toHaveBeenLastCalledWith(100);
    });

    it('ignores unrelated keys', () => {
      render(<WaveformSeekbar />);
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
      expect(playbackState.seek).not.toHaveBeenCalled();
    });
  });
});
