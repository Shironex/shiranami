import { useCallback, useEffect, useRef } from 'react';
import { usePlayerStore, currentTimeRef } from '@/stores/usePlayerStore';

export function SeekBar() {
  const duration = usePlayerStore(s => s.duration);
  const scrubTime = usePlayerStore(s => s.scrubTime);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const seek = usePlayerStore(s => s.seek);
  const setScrubTime = usePlayerStore(s => s.setScrubTime);

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
  const storeTime = usePlayerStore(s => s.currentTime);
  const displayTime = scrubTime ?? storeTime;
  const staticProgress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const needsStaticStyle = !isPlaying || scrubTime !== null;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      className="relative flex w-full touch-none select-none items-center group cursor-pointer py-1"
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 100}
      aria-valuenow={displayTime}
      tabIndex={0}
    >
      {/* Track */}
      <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-foreground/[0.06] group-hover:h-[5px] transition-all duration-200">
        {/* Range fill */}
        <div
          ref={fillRef}
          className="absolute h-full bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200"
          style={needsStaticStyle ? { width: `${staticProgress}%` } : undefined}
        />
      </div>
      {/* Thumb */}
      <div
        ref={thumbRef}
        className="absolute h-0 w-0 group-hover:h-3 group-hover:w-3 rounded-full bg-primary shadow-md shadow-primary/30 transition-all duration-200 -translate-x-1/2"
        style={needsStaticStyle ? { left: `${staticProgress}%` } : undefined}
      />
    </div>
  );
}
