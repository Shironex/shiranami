import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 * If the stage has not reported where it is by then (a slow first render),
 * the player opens anyway, as a plain fade.
 */
const PLACE_TIMEOUT_MS = 400;
/**
 * If the open has not reported its end this long after it should have (a
 * stalled frame, a lost callback), it is put at its end state by hand. The
 * player must never stay half open.
 */
const SETTLE_GRACE_MS = 600;

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
  /** True once open; the screen then draws its end state from React. */
  settled: boolean;
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

  const [settled, setSettled] = useState(false);
  const started = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback(
    (spot: MiniPlayerSpot | null, fade = false) => {
      if (reduceMotion || fade) {
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

  const settle = useCallback(() => {
    if (!closing.current) setSettled(true);
  }, []);

  const start = useCallback(
    (spot: MiniPlayerSpot | null, fade = false) => {
      if (started.current || closing.current) return;
      started.current = true;
      place(spot, fade);
      const config = reduceMotion || fade ? FADE : travel(MOTION.slow);
      progress.value = withTiming(1, config, finished => {
        if (finished) runOnJS(settle)();
      });
      settleTimer.current = setTimeout(
        () => {
          if (closing.current) return;
          cancelAnimation(progress);
          progress.value = 1;
          setSettled(true);
        },
        (config.duration ?? MOTION.slow) + SETTLE_GRACE_MS
      );
    },
    [place, progress, reduceMotion, settle]
  );

  const onPlaced = useCallback(() => {
    void firstSpot.current.then(spot => start(spot));
  }, [start]);

  useEffect(() => {
    const placeTimer = setTimeout(() => start(null, true), PLACE_TIMEOUT_MS);
    return () => clearTimeout(placeTimer);
  }, [start]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  usePreventRemove(true, ({ data }) => {
    if (closing.current) return;
    closing.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setSettled(false);
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      navigation.dispatch(data.action);
    };
    void measureMiniPlayer().then(spot => {
      place(spot);
      cancelAnimation(progress);
      leaving.value = true;
      const config = reduceMotion ? FADE : travel(CLOSE_MS);
      progress.value = withTiming(0, config, finished => {
        if (finished) runOnJS(leave)();
      });
      // The screen goes even if the end of the animation never reports back.
      setTimeout(leave, (config.duration ?? CLOSE_MS) + SETTLE_GRACE_MS);
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
  return { enter, row, makePan, settled };
}
