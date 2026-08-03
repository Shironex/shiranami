import { useEffect } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';

/**
 * The opt-in screensaver half of Sanctuary Mode: leave music playing and the
 * app untouched for the configured number of minutes and it enters the
 * fullscreen sanctuary on its own. Any pointer or keyboard activity in the
 * webview resets the stillness timer; the entry is skipped (and rescheduled)
 * while a dialog or the command palette is open, and never fires in compact
 * mode, while paused, or while the sanctuary is already up.
 */
export function useSanctuaryAutoEnter(): void {
  const autoEnter = useSanctuaryStore(s => s.sanctuaryAutoEnter);
  const minutes = useSanctuaryStore(s => s.sanctuaryAutoEnterMinutes);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const compactMode = useCompactStore(s => s.compactMode);

  useEffect(() => {
    if (!autoEnter || !isPlaying || compactMode) return;

    const delay = minutes * 60_000;
    let timer: number;

    const fire = () => {
      const sanctuary = useSanctuaryStore.getState();
      // A dialog/palette is open (Radix portals everything): the user parked
      // mid-task, not idle at their desk. Try again after another window.
      if (sanctuary.sanctuaryActive || document.querySelector('[data-radix-portal]')) {
        timer = window.setTimeout(fire, delay);
        return;
      }
      sanctuary.enterSanctuary({ auto: true });
    };

    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, delay);
    };

    reset();
    window.addEventListener('pointermove', reset);
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('wheel', reset);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', reset);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('wheel', reset);
    };
  }, [autoEnter, minutes, isPlaying, compactMode]);
}
