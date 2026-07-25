import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { useUIStore } from '@/stores/useUIStore';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { useWaveformPeaks } from '@/hooks/useWaveformPeaks';
import { formatDuration, clamp, clamp01 } from '@shiranami/shared';
import type { IWaveformSeekbarView } from './WaveformSeekbar.types';

/** Seconds the seek position moves per Arrow key (PageUp/Down move 2x). */
const SEEK_KEY_STEP_SECONDS = 5;
/** Bar geometry in CSS px. */
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
/** Floor so silent sections still render a visible sliver. */
const MIN_BAR_RATIO = 0.08;
/** Keep the hover time-bubble this many CSS px clear of either bar edge. */
const HOVER_BUBBLE_MARGIN = 18;
/** Opacity of the two tints baked into the cached raster. */
const PLAYED_ALPHA = 0.95;
const UNPLAYED_ALPHA = 0.22;
/**
 * Frame-rate cap, mirroring VISUALIZER_FPS. The played/unplayed split only ever
 * moves in whole bars (3 CSS px, so ~1 bar/second on a normal track), which
 * makes anything above 30fps a redraw of identical pixels — and on a 144Hz
 * display it would run ~4.8x more often than that.
 */
const WAVEFORM_FPS = 30;

/** Per-bar amplitudes reduced out of a peaks array, cached on their inputs. */
interface IBarAmpCache {
  peaks: Float32Array | null;
  barCount: number;
  amps: Float32Array;
}

/** The inputs the cached two-tint raster was drawn from. */
interface IRasterKey {
  peaks: Float32Array | null;
  width: number;
  height: number;
  dpr: number;
  colorVersion: number;
}

/** Bars that fit across `w` CSS px — the last one needs no trailing gap. */
function getBarCount(w: number): number {
  return Math.max(1, Math.floor((w + BAR_GAP) / BAR_STEP));
}

/**
 * SoundCloud-style waveform seekbar logic. Draws per-track peaks (decoded
 * natively in the main process) to a canvas, splitting played/unplayed at the
 * playhead, and seeks on click/drag/keyboard exactly like the plain SeekBar.
 * When peaks are unavailable (loading, radio, or an undecodable format) it
 * draws a flat bar so it stays a functional scrubber.
 *
 * The bars themselves are rasterised once per track/geometry/accent into an
 * offscreen canvas holding both tints, so a playing frame is two `drawImage`
 * blits rather than a peaks reduction plus a `fillRect` per bar.
 */
export function useWaveformSeekbar(): IWaveformSeekbarView {
  const { t } = useTranslation('player');
  const duration = usePlaybackStore(s => s.duration);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const seek = usePlaybackStore(s => s.seek);
  const storeTime = usePlaybackStore(s => s.currentTime);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const scrubTime = usePlayerUIStore(s => s.scrubTime);
  const setScrubTime = usePlayerUIStore(s => s.setScrubTime);

  const peaks = useWaveformPeaks(currentTrack?.filePath);

  // Normalisation factor: scale so the loudest bar fills the height. Recomputed
  // only when the peaks array changes, not per frame.
  const peakMax = useMemo(() => {
    if (!peaks || peaks.length === 0) return 1;
    let m = 0;
    for (let i = 0; i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
    return m > 0 ? m : 1;
  }, [peaks]);

  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverBubbleRef = useRef<HTMLDivElement>(null);
  // Cached during a hover sequence so the high-frequency onPointerMove reads the
  // track geometry once instead of forcing a synchronous layout recalc on every
  // move (its own style writes would otherwise re-trigger layout each frame).
  const trackRectRef = useRef<DOMRect | null>(null);
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef, versionRef: colorVersionRef } = usePrimaryRGB();
  const isDraggingRef = useRef(false);

  // Offscreen raster holding the whole waveform in both tints, plus the inputs
  // it was drawn from. `rasterVersionRef` ticks on every rebuild so a frame can
  // tell whether the pixels it wants are already on the visible canvas.
  const barAmpsRef = useRef<IBarAmpCache | null>(null);
  const rasterRef = useRef<HTMLCanvasElement | null>(null);
  const rasterKeyRef = useRef<IRasterKey | null>(null);
  const rasterVersionRef = useRef(0);
  const lastFrameRef = useRef<{ version: number; splitX: number } | null>(null);

  // The hover playhead + time bubble are a functional readout (the only motion
  // is a 150ms opacity fade), so they stay available under reduced motion —
  // only low-performance mode drops them to save the per-move wiring/DOM.
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const hoverEnabled = !lowPerformanceMode;

  const getValueFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !duration) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = clamp01((clientX - rect.left) / rect.width);
      return ratio * duration;
    },
    [duration]
  );

  const hideHover = useCallback(() => {
    // Drop the cached rect so the next hover sequence re-measures fresh geometry.
    trackRectRef.current = null;
    if (hoverLineRef.current) hoverLineRef.current.style.opacity = '0';
    if (hoverBubbleRef.current) hoverBubbleRef.current.style.opacity = '0';
  }, []);

  /**
   * Reduce the (512-wide) peaks array down to one amplitude per bar, taking the
   * max over each slice — preserves transients better than averaging. Cached on
   * the peaks identity + bar count, so this runs once per track/resize instead
   * of once per frame.
   */
  const getBarAmps = useCallback(
    (barCount: number): Float32Array => {
      const cached = barAmpsRef.current;
      if (cached && cached.peaks === peaks && cached.barCount === barCount) return cached.amps;

      const amps = new Float32Array(barCount);
      const len = peaks?.length ?? 0;
      for (let i = 0; i < barCount; i++) {
        if (!peaks || len === 0) {
          amps[i] = MIN_BAR_RATIO;
          continue;
        }
        const start = Math.floor((i / barCount) * len);
        const end = Math.max(start + 1, Math.floor(((i + 1) / barCount) * len));
        let peak = 0;
        for (let j = start; j < end && j < len; j++) {
          if (peaks[j] > peak) peak = peaks[j];
        }
        amps[i] = Math.max(MIN_BAR_RATIO, peak / peakMax);
      }

      barAmpsRef.current = { peaks, barCount, amps };
      return amps;
    },
    [peaks, peakMax]
  );

  /**
   * Hand back the offscreen raster, redrawing it only when an input moved — new
   * peaks (track change), a resize, a devicePixelRatio switch, or an accent /
   * theme change (tracked by the version `usePrimaryRGB` bumps). Both tints are
   * baked in as two stacked bands, played on top and unplayed below.
   */
  const ensureRaster = useCallback(
    (w: number, h: number, dpr: number): HTMLCanvasElement | null => {
      const colorVersion = colorVersionRef.current;
      const key = rasterKeyRef.current;
      const cached = rasterRef.current;
      if (
        cached &&
        key &&
        key.peaks === peaks &&
        key.width === w &&
        key.height === h &&
        key.dpr === dpr &&
        key.colorVersion === colorVersion
      ) {
        return cached;
      }

      // Held even when the context is unavailable (no canvas support), so the
      // degraded path doesn't allocate an element per frame.
      const raster = cached ?? document.createElement('canvas');
      rasterRef.current = raster;
      const ctx = raster.getContext('2d');
      if (!ctx) return null;

      // Device-pixel backing (crisp on retina) drawn in CSS px; assigning the
      // size also wipes whatever the previous raster held.
      const bh = Math.round(h * dpr);
      raster.width = Math.round(w * dpr);
      raster.height = bh * 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const [pr, pg, pb] = rgbRef.current;
      const barCount = getBarCount(w);
      const amps = getBarAmps(barCount);
      // Band height in CSS px, derived from the rounded device height so the
      // boundary between the two tints lands on an exact device pixel row.
      const bandHeight = bh / dpr;
      const mid = h / 2;

      for (let band = 0; band < 2; band++) {
        const alpha = band === 0 ? PLAYED_ALPHA : UNPLAYED_ALPHA;
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
        const top = band * bandHeight;
        for (let i = 0; i < barCount; i++) {
          const barH = amps[i] * h;
          ctx.fillRect(i * BAR_STEP, top + mid - barH / 2, BAR_WIDTH, barH);
        }
      }

      rasterKeyRef.current = { peaks, width: w, height: h, dpr, colorVersion };
      rasterVersionRef.current++;
      return raster;
    },
    [peaks, getBarAmps, rgbRef, colorVersionRef]
  );

  /** Paint the whole waveform with the played/unplayed split at `ratio` (0..1). */
  const paint = useCallback(
    (ratio: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const dpr = dprRef.current;
      const w = widthRef.current;
      const h = heightRef.current;
      if (w === 0 || h === 0) return;

      const raster = ensureRaster(w, h, dpr);
      if (!raster) return;

      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);

      // Split on a bar boundary rather than the raw playhead pixel: a bar flips
      // tint as a whole, exactly as the per-bar fill did.
      const barCount = getBarCount(w);
      const playedBars = clamp(Math.floor((ratio * w - BAR_WIDTH / 2) / BAR_STEP) + 1, 0, barCount);
      const splitX = Math.min(bw, Math.round(playedBars * BAR_STEP * dpr));

      // Because the split moves in whole bars, most frames ask for the pixels
      // already on the canvas — skip those outright instead of re-blitting.
      const version = rasterVersionRef.current;
      const last = lastFrameRef.current;
      if (last && last.version === version && last.splitX === splitX) return;
      lastFrameRef.current = { version, splitX };

      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Two source-rect blits out of the raster: the played band up to the
      // split, then the unplayed band (stacked below it) for the remainder.
      if (splitX > 0) {
        ctx.drawImage(raster, 0, 0, splitX, bh, 0, 0, splitX / dpr, bh / dpr);
      }
      const rest = bw - splitX;
      if (rest > 0) {
        ctx.drawImage(raster, splitX, bh, rest, bh, splitX / dpr, 0, rest / dpr, bh / dpr);
      }
    },
    [ensureRaster, widthRef, heightRef, dprRef]
  );

  // RAF loop while playing and not scrubbing — advances the played/unplayed
  // split. Capped at 30fps; gated by visibility/intersection.
  const tick = useCallback(() => {
    const ratio = duration > 0 ? currentTimeRef.current / duration : 0;
    paint(ratio);
  }, [duration, paint]);

  const rafActive = isPlaying && scrubTime === null;
  useRafLoop(tick, trackRef, rafActive, WAVEFORM_FPS);

  const displayTime = scrubTime ?? storeTime;
  const staticRatio = duration > 0 ? displayTime / duration : 0;
  const needsStatic = !isPlaying || scrubTime !== null;

  /** Repaint at the freshest playhead — for the paths that run outside React. */
  const repaintLatest = useCallback(() => {
    const d = usePlaybackStore.getState().duration;
    const scrub = usePlayerUIStore.getState().scrubTime;
    const time = scrub ?? currentTimeRef.current;
    paint(d > 0 ? time / d : 0);
  }, [paint]);

  // Paused or scrubbing: no RAF loop is running, so this is the only thing that
  // moves the split.
  useLayoutEffect(() => {
    if (!needsStatic) return;
    paint(staticRatio);
  }, [paint, needsStatic, staticRatio]);

  // While playing, the RAF loop owns the playhead, so this only has to cover a
  // commit that changes what's drawn — mounting mid-playback, or peaks arriving
  // for the new track. Keying it on the playhead instead (as `staticRatio`
  // does) would put a full paint on React's commit path 4x/sec for nothing.
  useLayoutEffect(() => {
    if (needsStatic) return;
    repaintLatest();
  }, [repaintLatest, needsStatic]);

  // Repaint on resize using the freshest playhead — the canvas-size refs update
  // without a re-render, so nothing else would trigger a redraw while paused.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Geometry changed, so the hover rect cached during an active hover is
      // now stale — drop it so the next move re-measures.
      trackRectRef.current = null;
      // useCanvasSize watches the same element with its own observer; defer a
      // frame so the repaint reads the new width/height rather than the size we
      // just grew out of, and so a drag-resize coalesces to one repaint/frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(repaintLatest);
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [repaintLatest]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      // The played/unplayed split follows the pointer during a drag, so the
      // hover playhead + bubble would be redundant — hide them.
      hideHover();
      setScrubTime(getValueFromPointer(e.clientX));

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onPointerMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return;
        setScrubTime(getValueFromPointer(ev.clientX));
      };
      // Cleanup must run for every way a drag can end — not just pointerup. If
      // capture is lost (system dialog, window switch) pointerup never fires, so
      // without this the scrub state stays stuck and the RAF loop never resumes.
      const cleanup = (pointerId: number) => {
        isDraggingRef.current = false;
        setScrubTime(null);
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerUp);
        target.removeEventListener('pointercancel', onPointerCancel);
        target.removeEventListener('lostpointercapture', onLostPointerCapture);
      };
      const onPointerUp = (ev: PointerEvent) => {
        if (isDraggingRef.current) seek(getValueFromPointer(ev.clientX));
        cleanup(ev.pointerId);
      };
      const onPointerCancel = (ev: PointerEvent) => cleanup(ev.pointerId);
      const onLostPointerCapture = (ev: PointerEvent) => cleanup(ev.pointerId);

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerUp);
      target.addEventListener('pointercancel', onPointerCancel);
      target.addEventListener('lostpointercapture', onLostPointerCapture);
    },
    [getValueFromPointer, setScrubTime, seek, hideHover]
  );

  // Plain hover (no drag): paint a faint playhead line at the cursor column and
  // show a time bubble for the timestamp under it. Positioned imperatively so a
  // 60fps mousemove never re-renders the canvas. Ignored while dragging.
  const onHoverMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDraggingRef.current) return;
      const track = trackRef.current;
      const line = hoverLineRef.current;
      const bubble = hoverBubbleRef.current;
      if (!track || !line || !bubble || !duration) return;
      // Measure once per hover sequence; hideHover clears this on pointer-leave so
      // the geometry is refreshed on the next hover rather than read every move.
      // A zero-width (not-yet-laid-out) rect is not cached, so it re-measures next
      // move just as the direct read did.
      let rect = trackRectRef.current;
      if (!rect) {
        rect = track.getBoundingClientRect();
        if (rect.width === 0) return;
        trackRectRef.current = rect;
      }

      const ratio = clamp01((e.clientX - rect.left) / rect.width);
      const x = ratio * rect.width;
      line.style.transform = `translateX(${x}px)`;
      line.style.opacity = '1';

      // Clamp the bubble so it never spills past the bar edges (fixed margin
      // avoids a per-move offsetWidth read / layout thrash).
      const bubbleX = Math.min(Math.max(x, HOVER_BUBBLE_MARGIN), rect.width - HOVER_BUBBLE_MARGIN);
      bubble.style.transform = `translateX(${bubbleX}px) translateX(-50%)`;
      bubble.style.opacity = '1';
      bubble.textContent = formatDuration(ratio * duration);
    },
    [duration]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!duration) return;
      const current =
        usePlayerUIStore.getState().scrubTime ?? usePlaybackStore.getState().currentTime;
      let next: number;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = Math.max(0, current - SEEK_KEY_STEP_SECONDS);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = Math.min(duration, current + SEEK_KEY_STEP_SECONDS);
          break;
        case 'PageDown':
          next = Math.max(0, current - SEEK_KEY_STEP_SECONDS * 2);
          break;
        case 'PageUp':
          next = Math.min(duration, current + SEEK_KEY_STEP_SECONDS * 2);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = duration;
          break;
        default:
          return;
      }
      e.preventDefault();
      seek(next);
    },
    [duration, seek]
  );

  return {
    label: t('seek'),
    valueMin: 0,
    valueMax: duration || 100,
    valueNow: displayTime,
    valueText: `${formatDuration(displayTime)} of ${formatDuration(duration)}`,
    trackRef,
    canvasRef,
    onPointerDown,
    onKeyDown,
    hoverEnabled,
    hoverLineRef,
    hoverBubbleRef,
    onPointerMove: onHoverMove,
    onPointerLeave: hideHover,
  };
}
