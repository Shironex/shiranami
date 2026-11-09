import { useCallback, useEffect, useRef } from 'react';
import {
  ReduceMotion,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSettingsContext } from '@/context/SettingsContext';
import { MOTION, motion } from '@/lib/motion';
import { cardFolded, pressCardTab } from '@/lib/player-stage';
import { usePlayerViewStore, type PlayerCardTab } from '@/stores/usePlayerViewStore';

/** With reduce motion on, the layout swaps while the stage is faded out. */
const FADE_OUT_MS = 120;
const FADE_IN_MS = 180;

/**
 * The player card's tab and open or folded state, plus the shared values the
 * stage animates with: `hero` (0 open, 1 folded) and `fade` (the stage's
 * opacity, used only by the reduced motion fallback). The open or folded
 * choice is saved in settings, the tab is kept for the session.
 */
export function usePlayerFold(trackId: string, live: boolean, hasLyrics: boolean) {
  const { settings, update } = useSettingsContext();
  const mode = settings.playerCard;
  const tab = usePlayerViewStore(s => s.tab);
  const setTab = usePlayerViewStore(s => s.setTab);
  const reduceMotion = useReducedMotion();
  const folded = cardFolded(mode, live, hasLyrics);

  const hero = useSharedValue(folded ? 1 : 0);
  const fade = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = folded ? 1 : 0;
    if (reduceMotion) {
      // Fades are what reduce motion leaves, so these opt out of its skipping.
      const never = ReduceMotion.Never;
      fade.value = withSequence(
        withTiming(0, { duration: FADE_OUT_MS, reduceMotion: never }),
        withTiming(1, { duration: FADE_IN_MS, reduceMotion: never })
      );
      hero.value = withDelay(
        FADE_OUT_MS,
        withTiming(target, { duration: 0, reduceMotion: never }),
        never
      );
    } else {
      hero.value = withTiming(target, motion(MOTION.slow));
    }
  }, [folded, reduceMotion, hero, fade]);

  // Until the user picks, a song with lyrics opens on the lyrics tab.
  useEffect(() => {
    if (mode === 'auto' && hasLyrics) setTab('lyrics');
  }, [trackId, mode, hasLyrics, setTab]);

  const onTab = useCallback(
    (pressed: PlayerCardTab) => {
      const next = pressCardTab(folded, tab, pressed);
      if (next.tab !== tab) setTab(next.tab);
      if (next.mode) update('playerCard', next.mode);
    },
    [folded, tab, setTab, update]
  );

  return { folded, hero, fade, tab, onTab };
}
