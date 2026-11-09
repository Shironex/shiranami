import { useCallback, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  ReduceMotion,
  cancelAnimation,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import type { StageEnter } from '@/components/player/PlayerStage';
import { MOTION, motion } from '@/lib/motion';
import { measureMiniPlayer, type MiniPlayerSpot } from '@/lib/player-origin';
import type { Rect } from '@/lib/player-stage';

/** Closing is a little quicker than opening: the user already decided. */
const CLOSE_MS = 280;
/** Let go past this drag, or flick down faster than this, and the player closes. */
const DISMISS_DRAG = 140;
const DISMISS_VELOCITY = 900;
/** With reduce motion on, open and close are plain fades. */
const FADE: WithTimingConfig = { duration: 200, reduceMotion: ReduceMotion.Never };

/**
 * `progress` runs linearly; the stage eases each piece itself, so the pieces
 * can start at different times and still land softly.
 */
function travel(duration: number): WithTimingConfig {
  return { duration, easing: Easing.linear };
}

/** Where the player grows from when the mini player is not on screen: the bottom edge. */
function bottomSpot(width: number, height: number): MiniPlayerSpot {
  return {
    art: { x: width / 2 - 22, y: height - 120, width: 44, height: 44 },
    row: { x: 10, y: height - 140, width: width - 20, height: 64 },
  };
}

export interface PlayerEnter {
  /** What the stage needs to fly the cover and stagger its pieces. */
  enter: StageEnter;
  /** The mini player row the backdrop grows out of, or null to just fade. */
  row: SharedValue<Rect | null>;
  /** Builds a pan that drags the player down; one per GestureDetector. */
  makePan: () => ReturnType<typeof Gesture.Pan>;
}

/**
 * The player's open and close transition. On open the cover flies out of the
 * mini player's artwork and the backdrop grows out of its row while the rest
 * fades in; every way of leaving (the chevron, Android back, a swipe down)
 * runs it in reverse, back into the mini player, before the screen goes.
 */
export function usePlayerEnter(): PlayerEnter {
  const navigation = useNavigation();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const origin = useSharedValue<Rect | null>(null);
  const row = useSharedValue<Rect | null>(null);
  const offset = useSharedValue({ x: 0, y: 0 });
  const drag = useSharedValue(0);
  const leaving = useSharedValue(false);
  // Measure as early as possible, while the stage lays out.
  const firstSpot = useRef(measureMiniPlayer());
  const closing = useRef(false);

  const place = useCallback(
    (spot: MiniPlayerSpot | null) => {
      if (reduceMotion) {
        origin.value = null;
        row.value = null;
        return;
      }
      const at = spot ?? bottomSpot(width, height);
      origin.value = at.art;
      row.value = at.row;
    },
    [reduceMotion, width, height, origin, row]
  );

  const onPlaced = useCallback(() => {
    void firstSpot.current.then(spot => {
      if (closing.current) return;
      place(spot);
      progress.value = withTiming(1, reduceMotion ? FADE : travel(MOTION.slow));
    });
  }, [place, progress, reduceMotion]);

  usePreventRemove(true, ({ data }) => {
    if (closing.current) return;
    closing.current = true;
    const leave = () => navigation.dispatch(data.action);
    void measureMiniPlayer().then(spot => {
      place(spot);
      cancelAnimation(progress);
      leaving.value = true;
      progress.value = withTiming(0, reduceMotion ? FADE : travel(CLOSE_MS), finished => {
        if (finished) runOnJS(leave)();
      });
    });
  });

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const makePan = useCallback(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-24, 24])
        .onUpdate(e => {
          drag.value = Math.max(0, e.translationY);
        })
        .onEnd(e => {
          if (drag.value > DISMISS_DRAG || e.velocityY > DISMISS_VELOCITY) {
            runOnJS(close)();
          } else {
            drag.value = withTiming(0, motion(MOTION.base));
          }
        }),
    [close, drag]
  );

  const enter = useMemo(
    () => ({ progress, origin, offset, drag, leaving, onPlaced }),
    [progress, origin, offset, drag, leaving, onPlaced]
  );
  return { enter, row, makePan };
}
