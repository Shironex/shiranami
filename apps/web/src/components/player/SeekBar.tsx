import { useCallback, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { useRafLoop } from '@/hooks/useRafLoop';
import { formatDuration } from '@shiranami/shared';

/** Apply a 0..1 progress ratio to the fill (scaleX) and thumb (translateX).
 *  Both are compositor-only transforms — no layout/paint per frame. The thumb
 *  offset is in track-relative pixels; translateX(-50%) keeps it centered on
 *  the progress point regardless of the thumb's own (hover-animated) width. */
function applyProgress(
  ratio: number,
  fill: HTMLDivElement | null,
  thumb: HTMLDivElement | null,
  trackWidth: number
) {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (fill) fill.style.transform = `scaleX(${clamped})`;
  if (thumb) thumb.style.transform = `translateX(${clamped * trackWidth}px) translateX(-50%)`;
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
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
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
    const trackWidth = trackRef.current?.clientWidth ?? 0;
    const ratio = duration > 0 ? currentTimeRef.current / duration : 0;
    applyProgress(ratio, fillRef.current, thumbRef.current, trackWidth);
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

  useLayoutEffect(() => {
    if (!needsStaticStyle) return;
    const trackWidth = trackRef.current?.clientWidth ?? 0;
    applyProgress(staticRatio, fillRef.current, thumbRef.current, trackWidth);
  }, [needsStaticStyle, staticRatio]);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
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
