import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { triggerResize } from '@/test/setup';
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

/** The RAF-driven playhead the paint loop reads, mutable per test. */
const currentTimeRef = vi.hoisted(() => ({ current: 0 }));

vi.mock('@/stores/usePlaybackStore', () => {
  const hook = <T,>(selector: (s: typeof playbackState) => T) => selector(playbackState);
  return {
    usePlaybackStore: Object.assign(hook, { getState: () => playbackState }),
    currentTimeRef,
  };
});

vi.mock('@/stores/usePlayerUIStore', () => {
  const hook = <T,>(selector: (s: typeof uiState) => T) => selector(uiState);
  return { usePlayerUIStore: Object.assign(hook, { getState: () => uiState }) };
});

// The waveform's drawing dependencies (native peaks IPC, canvas sizing, primary
// colour) are stubbed with stable, test-writable refs: the seek-contract tests
// leave them inert (zero-sized canvas), while the raster-cache tests drive them
// to assert when the waveform is (and isn't) redrawn.
const peaksState = vi.hoisted(() => ({ current: null as Float32Array | null }));
const canvasSize = vi.hoisted(() => ({
  widthRef: { current: 0 },
  heightRef: { current: 0 },
  dprRef: { current: 1 },
}));
const primary = vi.hoisted(() => ({
  rgbRef: { current: [155, 125, 235] as [number, number, number] },
  versionRef: { current: 0 },
}));
const rafLoop = vi.hoisted(() => ({
  callback: null as (() => void) | null,
  isActive: false,
  fps: 0,
}));

vi.mock('@/hooks/useWaveformPeaks', () => ({ useWaveformPeaks: () => peaksState.current }));
vi.mock('@/hooks/useRafLoop', () => ({
  useRafLoop: (callback: () => void, _ref: unknown, isActive: boolean, fps?: number) => {
    rafLoop.callback = callback;
    rafLoop.isActive = isActive;
    rafLoop.fps = fps ?? 0;
  },
}));
vi.mock('@/hooks/useCanvasSize', () => ({ useCanvasSize: () => canvasSize }));
vi.mock('@/hooks/usePrimaryRGB', () => ({ usePrimaryRGB: () => primary }));

// jsdom implements set/releasePointerCapture (via test setup) but not
// hasPointerCapture, which the drag-end cleanup calls. Stub it to false so the
// pointer-up path runs without throwing.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

/** Recording stand-in for a 2D context — jsdom has no canvas implementation. */
interface IFakeContext {
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  /** Every value assigned to `fillStyle`, in order. */
  fillStyles: string[];
  fillStyle: string;
}

function createFakeContext(): IFakeContext {
  const fillStyles: string[] = [];
  let fillStyle = '';
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyles,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
      fillStyles.push(value);
    },
  };
}

// Contexts in creation order: the visible canvas asks first, the offscreen
// raster second, and each element keeps the same context across calls.
const fakeContexts: IFakeContext[] = [];
const contextByCanvas = new WeakMap<HTMLCanvasElement, IFakeContext>();

HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  let ctx = contextByCanvas.get(this);
  if (!ctx) {
    ctx = createFakeContext();
    contextByCanvas.set(this, ctx);
    fakeContexts.push(ctx);
  }
  return ctx;
} as unknown as HTMLCanvasElement['getContext'];

const visibleCtx = (): IFakeContext => fakeContexts[0];
const rasterCtx = (): IFakeContext => fakeContexts[1];

/** Advance one animation frame (the resize repaint is deferred by one). */
async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });
  });
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
    currentTimeRef.current = 0;
    peaksState.current = null;
    canvasSize.widthRef.current = 0;
    canvasSize.heightRef.current = 0;
    canvasSize.dprRef.current = 1;
    primary.rgbRef.current = [155, 125, 235];
    primary.versionRef.current = 0;
    rafLoop.callback = null;
    fakeContexts.length = 0;
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

  describe('raster caching', () => {
    /** 60 CSS px at a 3px bar step = 20 bars, each drawn in two tint bands. */
    const BARS = 20;

    beforeEach(() => {
      canvasSize.widthRef.current = 60;
      canvasSize.heightRef.current = 28;
      // A ramp, so per-bar amplitudes differ and the quietest bars hit the floor.
      peaksState.current = Float32Array.from({ length: 512 }, (_, i) => (i + 1) / 512);
    });

    it('caps the paint loop at 30fps', () => {
      render(<WaveformSeekbar />);
      expect(rafLoop.fps).toBe(30);
    });

    it('reduces the peaks once and blits the cached raster on later frames', () => {
      render(<WaveformSeekbar />);
      expect(rasterCtx().fillRect).toHaveBeenCalledTimes(BARS * 2);

      const blits = visibleCtx().drawImage.mock.calls.length;
      currentTimeRef.current = 25;
      rafLoop.callback?.();

      // The split moved several bars, so the visible canvas is re-blitted — but
      // neither the peaks reduction nor the bar fills are repeated.
      expect(visibleCtx().drawImage.mock.calls.length).toBeGreaterThan(blits);
      expect(rasterCtx().fillRect).toHaveBeenCalledTimes(BARS * 2);
    });

    it('skips the blit while the playhead stays inside the same bar', () => {
      render(<WaveformSeekbar />);
      currentTimeRef.current = 25;
      rafLoop.callback?.();
      const blits = visibleCtx().drawImage.mock.calls.length;

      currentTimeRef.current = 25.5;
      rafLoop.callback?.();
      expect(visibleCtx().drawImage.mock.calls.length).toBe(blits);
    });

    it('rebuilds the raster when the track peaks change', () => {
      const { rerender } = render(<WaveformSeekbar />);
      expect(rasterCtx().fillRect).toHaveBeenCalledTimes(BARS * 2);

      peaksState.current = Float32Array.from({ length: 512 }, () => 1);
      rerender(<WaveformSeekbar />);
      expect(rasterCtx().fillRect).toHaveBeenCalledTimes(BARS * 4);
    });

    it('rebuilds the raster after a container resize', async () => {
      const { container } = render(<WaveformSeekbar />);
      const canvas = container.querySelector('canvas');
      if (!canvas) throw new Error('canvas missing');
      rasterCtx().fillRect.mockClear();

      // useCanvasSize owns the size refs — mirror what its observer would write.
      canvasSize.widthRef.current = 120;
      triggerResize(canvas, { width: 120, height: 28 });
      await flushFrame();

      // 120 CSS px fits 40 bars, so the wider raster is drawn from scratch.
      expect(rasterCtx().fillRect).toHaveBeenCalledTimes(40 * 2);
    });

    it('rebuilds the raster when the devicePixelRatio changes', () => {
      render(<WaveformSeekbar />);
      rasterCtx().fillRect.mockClear();

      canvasSize.dprRef.current = 2;
      rafLoop.callback?.();

      expect(rasterCtx().fillRect).toHaveBeenCalledTimes(BARS * 2);
    });

    it('rebuilds the raster in the new tints when the accent changes', () => {
      render(<WaveformSeekbar />);
      rasterCtx().fillStyles.length = 0;

      primary.rgbRef.current = [10, 20, 30];
      primary.versionRef.current += 1;
      rafLoop.callback?.();

      expect(rasterCtx().fillStyles).toEqual(['rgba(10, 20, 30, 0.95)', 'rgba(10, 20, 30, 0.22)']);
    });

    it('draws a flat bar while the peaks are still loading', () => {
      peaksState.current = null;
      render(<WaveformSeekbar />);

      const heights = rasterCtx().fillRect.mock.calls.map(call => call[3]);
      expect(heights).toHaveLength(BARS * 2);
      // Every bar sits on the silent-section floor (0.08 of the 28px height).
      expect(new Set(heights).size).toBe(1);
      expect(heights[0]).toBeCloseTo(28 * 0.08, 5);
      expect(visibleCtx().drawImage).toHaveBeenCalled();
    });

    it('does not repaint on the playback time tick while playing', () => {
      playbackState.isPlaying = true;
      const { rerender } = render(<WaveformSeekbar />);
      const blits = visibleCtx().drawImage.mock.calls.length;
      expect(blits).toBeGreaterThan(0);

      // The store lands `currentTime` 4x/sec; the RAF loop owns the playhead, so
      // that commit must not drag a full canvas write along with it — not even
      // once the playhead has moved far enough to change the split.
      playbackState.currentTime = 50;
      currentTimeRef.current = 50;
      rerender(<WaveformSeekbar />);

      expect(visibleCtx().drawImage.mock.calls.length).toBe(blits);
    });

    it('repaints as the scrub position moves', () => {
      playbackState.isPlaying = true;
      uiState.scrubTime = 25;
      const { rerender } = render(<WaveformSeekbar />);
      const blits = visibleCtx().drawImage.mock.calls.length;
      // Scrubbing parks the RAF loop, so the static path is the only painter.
      expect(rafLoop.isActive).toBe(false);

      uiState.scrubTime = 50;
      rerender(<WaveformSeekbar />);
      expect(visibleCtx().drawImage.mock.calls.length).toBeGreaterThan(blits);
    });
  });
});
