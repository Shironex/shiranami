import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore, currentTimeRef } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';
import { formatDuration } from '@shiranami/shared';

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
  const rafRef = useRef<number>(0);

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

  // RAF loop for smooth seek bar updates while playing and not scrubbing
  useEffect(() => {
    if (!isPlaying || scrubTime !== null) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const time = currentTimeRef.current;
      const progress = duration > 0 ? (time / duration) * 100 : 0;
      const pct = `${progress}%`;

      if (fillRef.current) fillRef.current.style.width = pct;
      if (thumbRef.current) thumbRef.current.style.left = pct;

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, scrubTime, duration]);

  // When paused or scrubbing, compute progress from store values
  const storeTime = usePlaybackStore(s => s.currentTime);
  const displayTime = scrubTime ?? storeTime;
  const staticProgress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const needsStaticStyle = !isPlaying || scrubTime !== null;

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
        {/* Range fill */}
        <div
          ref={fillRef}
          className="absolute h-full bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200 group-hover:shadow-[0_0_8px_0_rgba(var(--primary-rgb),0.5)]"
          style={needsStaticStyle ? { width: `${staticProgress}%` } : undefined}
        />
      </div>
      {/* Thumb */}
      <div
        ref={thumbRef}
        className="absolute h-0 w-0 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_10px_0_rgba(var(--primary-rgb),0.6)] transition-[width,height,background-color,box-shadow] duration-200 group-hover:h-3 group-hover:w-3"
        style={needsStaticStyle ? { left: `${staticProgress}%` } : undefined}
      />
    </div>
  );
}
