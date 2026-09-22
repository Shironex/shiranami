import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { useSleepTimerStore, WIND_DOWN_DIM_WINDOW_SECONDS } from '@/stores/useSleepTimerStore';
import { useWindDownStore } from '@/stores/useWindDownStore';
import type { IWindDownOverlayView } from './WindDownOverlay.types';

/**
 * The dim never exceeds this — a readable floor, so a winding-down UI is
 * legibly dimmed rather than gone. Composes over the theme layers (a black
 * veil above everything) instead of touching the user's persisted
 * `--theme-bg-dim`, which stays exactly where they set it.
 */
export const WIND_DOWN_MAX_DIM = 0.45;

/** Any interaction lifts the dim for this long — the room brightens while you're up. */
export const ACTIVITY_LIFT_MS = 30_000;

/**
 * Dim progress (0 … 1) for the current tick. Ramps linearly over the final
 * dim window; holds at 1 through the expiry fade (endTime already null while
 * `windDown` is still true).
 */
export function getDimProgress(
  remainingSeconds: number,
  durationMinutes: number | null,
  timerRunning: boolean
): number {
  if (!timerRunning) return 1;
  const windowSeconds = Math.min(
    WIND_DOWN_DIM_WINDOW_SECONDS,
    Math.max(1, (durationMinutes ?? 0) * 60)
  );
  if (remainingSeconds >= windowSeconds) return 0;
  return (windowSeconds - remainingSeconds) / windowSeconds;
}

export function useWindDownOverlay(): IWindDownOverlayView {
  const { t } = useTranslation('sleepTimer');
  const animate = useDecorativeMotion();

  const windDown = useSleepTimerStore(s => s.windDown);
  const endTime = useSleepTimerStore(s => s.endTime);
  const duration = useSleepTimerStore(s => s.duration);
  const remaining = useSleepTimerStore(s => s.remaining);

  const closingLineUntil = useWindDownStore(s => s.closingLineUntil);
  const clearClosingLine = useWindDownStore(s => s.clearClosingLine);

  const closingActive = closingLineUntil !== null && closingLineUntil > Date.now();

  // Let the closing line linger, then fold the whole overlay away.
  useEffect(() => {
    if (closingLineUntil === null) return;
    const delay = Math.max(0, closingLineUntil - Date.now());
    const timer = setTimeout(() => clearClosingLine(), delay);
    return () => clearTimeout(timer);
  }, [closingLineUntil, clearClosingLine]);

  // Ease the closing line in one frame after it mounts (unless motion is off).
  const [closingLineShown, setClosingLineShown] = useState(false);
  useEffect(() => {
    if (!closingActive) {
      setClosingLineShown(false);
      return;
    }
    if (!animate) {
      setClosingLineShown(true);
      return;
    }
    const frame = requestAnimationFrame(() => setClosingLineShown(true));
    return () => cancelAnimationFrame(frame);
  }, [closingActive, animate]);

  const progress = windDown ? getDimProgress(remaining, duration, endTime !== null) : 0;
  const dimming = windDown && progress > 0;

  // The dimming must never read as a bug: any real interaction lifts it
  // instantly and it only settles back after a quiet half-minute — the same
  // "the user is in charge" contract the fade honours on manual resume.
  const [lifted, setLifted] = useState(false);
  const liftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dimming) {
      setLifted(false);
      return;
    }
    const onActivity = () => {
      setLifted(true);
      if (liftTimerRef.current) clearTimeout(liftTimerRef.current);
      liftTimerRef.current = setTimeout(() => setLifted(false), ACTIVITY_LIFT_MS);
    };
    window.addEventListener('pointerdown', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    return () => {
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      if (liftTimerRef.current) {
        clearTimeout(liftTimerRef.current);
        liftTimerRef.current = null;
      }
    };
  }, [dimming]);

  const holdingForLine = !windDown && closingActive;
  const dimOpacity = lifted ? 0 : (holdingForLine ? 1 : progress) * WIND_DOWN_MAX_DIM;

  return {
    visible: dimming || closingActive,
    dimOpacity,
    closingLine: closingActive ? t('closingLine') : null,
    closingLineShown,
    animate,
  };
}
