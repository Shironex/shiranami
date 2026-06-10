import { useCallback, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { useRafLoop } from '@/hooks/useRafLoop';
import { formatDuration, clamp01 } from '@shiranami/shared';

/** Apply a 0..1 progress ratio to the fill (scaleX) and thumb (left + translateX).
 *  The fill is a compositor-only transform — no layout/paint per frame. The thumb
 *  is positioned with a percentage `left` so it stays correct across track
 *  resizes without depending on a cached pixel width; translateX(-50%) keeps it
 *  centered on the progress point regardless of the thumb's own (hover-animated)
 *  width. The percentage `left` resolves against the live track width on every
 *  layout, so this is a one-time layout on value change (not per-frame). */
/** Seconds the seek position moves per Arrow key press (PageUp/Down move 2x). */
const SEEK_KEY_STEP_SECONDS = 5;

function applyProgress(ratio: number, fill: HTMLDivElement | null, thumb: HTMLDivElement | null) {
  const clamped = clamp01(ratio);
  if (fill) fill.style.transform = `scaleX(${clamped})`;
  if (thumb) {
    thumb.style.left = `${clamped * 100}%`;
    thumb.style.transform = 'translateX(-50%)';
  }
}

export function SeekBar() {
  const { t } = useTranslation('player');
  const duration = usePlaybackStore(s => s.duration);
  const scrubTime = usePlayerUIStore(s => s.scrubTime);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const seek = usePlaybackStore(s => s.seek);
  const setScrubTime = usePlayerUIStore(s => s.setScrubTime);

  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const value = getValueFromPointer(e.clientX);
      setScrubTime(value);

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onPointerMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return;
        const val = getValueFromPointer(ev.clientX);
        setScrubTime(val);
      };

      const onPointerUp = (ev: PointerEvent) => {
        if (isDraggingRef.current) {
          const val = getValueFromPointer(ev.clientX);
          seek(val);
          // scrubTime now lives in a separate UI store; clear it explicitly
          // on commit so the display falls back to the real playback time.
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

  // RAF loop for smooth seek bar updates while playing and not scrubbing.
  // Routed through useRafLoop so it also stops when the window is hidden or the
  // bar scrolls off-screen — not only when Chromium happens to throttle rAF.
  const tick = useCallback(() => {
    const ratio = duration > 0 ? currentTimeRef.current / duration : 0;
    applyProgress(ratio, fillRef.current, thumbRef.current);
  }, [duration]);

  const rafActive = isPlaying && scrubTime === null;
  useRafLoop(tick, trackRef, rafActive);

  // When paused or scrubbing, the rAF is inactive — drive the same transforms
  // from store values in a layout effect so the position stays exact (and the
  // thumb tracks pointer drags) without animating layout properties.
  const storeTime = usePlaybackStore(s => s.currentTime);
  const displayTime = scrubTime ?? storeTime;
  const staticRatio = duration > 0 ? displayTime / duration : 0;
  const needsStaticStyle = !isPlaying || scrubTime !== null;

  // Keyboard operability for the slider role: Arrow keys seek by a small step,
  // PageUp/Down by a larger one, Home/End jump to the ends. Without this the
  // primary transport control is unusable by keyboard and switch users.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!duration) return;
      // Read the freshest time from the stores at keypress time rather than
      // closing over `displayTime` (which changes ~once/second during playback
      // and would rebuild this callback on every tick).
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

  useLayoutEffect(() => {
    if (!needsStaticStyle) return;
    applyProgress(staticRatio, fillRef.current, thumbRef.current);
  }, [needsStaticStyle, staticRatio]);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className="group relative flex min-w-0 flex-1 touch-none cursor-pointer select-none items-center py-1"
      role="slider"
      aria-label={t('seek')}
      aria-valuemin={0}
      aria-valuemax={duration || 100}
      aria-valuenow={displayTime}
      aria-valuetext={`${formatDuration(displayTime)} of ${formatDuration(duration)}`}
      tabIndex={0}
    >
      {/* Track */}
      <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-foreground/[0.06] group-hover:h-[5px] transition-all duration-200">
        {/* Range fill — full width, scaled along X (compositor-only). */}
        <div
          ref={fillRef}
          className="absolute h-full w-full origin-left bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200 group-hover:shadow-[0_0_8px_0_rgba(var(--primary-rgb),0.5)]"
        />
      </div>
      {/* Thumb — positioned via translateX (compositor-only). */}
      <div
        ref={thumbRef}
        className="absolute left-0 h-0 w-0 rounded-full bg-primary shadow-[0_0_10px_0_rgba(var(--primary-rgb),0.6)] transition-[width,height,background-color,box-shadow] duration-200 group-hover:h-3 group-hover:w-3"
      />
    </div>
  );
}
