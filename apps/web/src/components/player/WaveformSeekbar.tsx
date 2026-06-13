import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { useRafLoop } from '@/hooks/useRafLoop';
import { useCanvasSize } from '@/hooks/useCanvasSize';
import { usePrimaryRGB } from '@/hooks/usePrimaryRGB';
import { useWaveformPeaks } from '@/hooks/useWaveformPeaks';
import { formatDuration, clamp01 } from '@shiranami/shared';

/** Seconds the seek position moves per Arrow key (PageUp/Down move 2x). */
const SEEK_KEY_STEP_SECONDS = 5;
/** Bar geometry in CSS px. */
const BAR_WIDTH = 2;
const BAR_GAP = 1;
/** Floor so silent sections still render a visible sliver. */
const MIN_BAR_RATIO = 0.08;

/**
 * SoundCloud-style waveform seekbar. Draws per-track peaks (decoded natively in
 * the main process) to a canvas, splitting played/unplayed at the playhead, and
 * seeks on click/drag/keyboard exactly like the plain SeekBar. When peaks are
 * unavailable (loading, radio, or an undecodable format) it draws a flat bar so
 * it stays a functional scrubber.
 */
interface WaveformSeekbarProps {
  /** Tailwind height class for the canvas. Defaults to the compact player-bar
   *  size; the full-screen Now Playing view passes a taller one. */
  canvasClassName?: string;
}

export function WaveformSeekbar({ canvasClassName = 'h-7' }: WaveformSeekbarProps = {}) {
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
  const { widthRef, heightRef, dprRef } = useCanvasSize(canvasRef);
  const { rgbRef } = usePrimaryRGB();
  const isDraggingRef = useRef(false);

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

      // Back the canvas with device pixels (crisp on retina) but draw in CSS px.
      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const [pr, pg, pb] = rgbRef.current;
      const playedColor = `rgba(${pr}, ${pg}, ${pb}, 0.95)`;
      const unplayedColor = `rgba(${pr}, ${pg}, ${pb}, 0.22)`;

      const step = BAR_WIDTH + BAR_GAP;
      const barCount = Math.max(1, Math.floor((w + BAR_GAP) / step));
      const mid = h / 2;
      const progressX = ratio * w;
      const len = peaks?.length ?? 0;

      for (let i = 0; i < barCount; i++) {
        const x = i * step;

        // Reduce the (512-wide) peaks array to this bar by taking the max over
        // its slice — preserves transients better than averaging.
        let amp = MIN_BAR_RATIO;
        if (peaks && len > 0) {
          const start = Math.floor((i / barCount) * len);
          const end = Math.max(start + 1, Math.floor(((i + 1) / barCount) * len));
          let peak = 0;
          for (let j = start; j < end && j < len; j++) {
            if (peaks[j] > peak) peak = peaks[j];
          }
          amp = Math.max(MIN_BAR_RATIO, peak / peakMax);
        }

        const barH = amp * h;
        const y = mid - barH / 2;
        ctx.fillStyle = x + BAR_WIDTH / 2 <= progressX ? playedColor : unplayedColor;
        ctx.fillRect(x, y, BAR_WIDTH, barH);
      }
    },
    [peaks, peakMax, widthRef, heightRef, dprRef, rgbRef]
  );

  // RAF loop while playing and not scrubbing — advances the played/unplayed
  // split smoothly. Capped at 60fps; gated by visibility/intersection.
  const tick = useCallback(() => {
    const ratio = duration > 0 ? currentTimeRef.current / duration : 0;
    paint(ratio);
  }, [duration, paint]);

  const rafActive = isPlaying && scrubTime === null;
  useRafLoop(tick, trackRef, rafActive, 60);

  // Static paint when paused/scrubbing, and whenever inputs change (peaks load,
  // color/size change) so the waveform appears immediately without waiting for
  // the next playing frame.
  const displayTime = scrubTime ?? storeTime;
  const staticRatio = duration > 0 ? displayTime / duration : 0;
  const needsStatic = !isPlaying || scrubTime !== null;
  useLayoutEffect(() => {
    const ratio = needsStatic ? staticRatio : duration > 0 ? currentTimeRef.current / duration : 0;
    paint(ratio);
  }, [paint, needsStatic, staticRatio, duration]);

  // Repaint on resize using the freshest playhead — the canvas-size refs update
  // without a re-render, so nothing else would trigger a redraw while paused.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const d = usePlaybackStore.getState().duration;
      const scrub = usePlayerUIStore.getState().scrubTime;
      const time = scrub ?? currentTimeRef.current;
      paint(d > 0 ? time / d : 0);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setScrubTime(getValueFromPointer(e.clientX));

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onPointerMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return;
        setScrubTime(getValueFromPointer(ev.clientX));
      };
      const onPointerUp = (ev: PointerEvent) => {
        if (isDraggingRef.current) {
          seek(getValueFromPointer(ev.clientX));
          setScrubTime(null);
          isDraggingRef.current = false;
        }
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerUp);
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerUp);
    },
    [getValueFromPointer, setScrubTime, seek]
  );

  const handleKeyDown = useCallback(
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

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className="group relative flex min-w-0 flex-1 touch-none cursor-pointer select-none items-center"
      role="slider"
      aria-label={t('seek')}
      aria-valuemin={0}
      aria-valuemax={duration || 100}
      aria-valuenow={displayTime}
      aria-valuetext={`${formatDuration(displayTime)} of ${formatDuration(duration)}`}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className={`${canvasClassName} w-full`} />
    </div>
  );
}
