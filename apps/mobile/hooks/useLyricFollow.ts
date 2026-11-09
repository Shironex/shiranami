import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  followPaused,
  followScrollTarget,
  LYRIC_FOLLOW_RESUME_MS,
  type RowLayout,
} from '@/lib/lyrics-sync';
import { motion } from '@/lib/motion';

/** The follow scroll is longer than a tap transition: it travels a whole line. */
const FOLLOW_MS = 420;

/**
 * Keeps the sung lyric line in view, a third of the way down the list, with
 * an eased scroll on the UI thread. A hand scroll pauses following; a few
 * seconds after the list settles it glides back to the sung line. Feed the
 * returned handlers to a `FadeScroll` and each row's `onRowLayout`.
 */
export function useLyricFollow(active: number, enabled: boolean) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const target = useSharedValue(0);
  const driving = useSharedValue(false);

  const rows = useRef(new Map<number, RowLayout>());
  const box = useRef({ viewport: 0, content: 0 });
  const activeRef = useRef(active);
  const dragging = useRef(false);
  const handEndedAt = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placed = useRef(false);

  useAnimatedReaction(
    () => target.value,
    value => {
      if (driving.value) scrollTo(scrollRef, 0, value, false);
    }
  );

  const follow = useCallback(
    (animate: boolean) => {
      if (!enabled || dragging.current) return;
      if (followPaused(handEndedAt.current, Date.now())) return;
      const row = rows.current.get(activeRef.current);
      const { viewport, content } = box.current;
      if (!row || viewport === 0) return;
      const y = followScrollTarget(row, viewport, content);
      cancelAnimation(target);
      driving.value = true;
      if (animate && placed.current) {
        target.value = offset.value;
        target.value = withTiming(y, motion(FOLLOW_MS));
      } else {
        target.value = y;
      }
      placed.current = true;
    },
    [enabled, driving, offset, target]
  );

  useEffect(() => {
    activeRef.current = active;
    follow(true);
  }, [active, follow]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    []
  );

  const clearTimer = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
  };

  const handStarted = useCallback(() => {
    dragging.current = true;
    clearTimer();
  }, []);

  const handEnded = useCallback(() => {
    dragging.current = false;
    handEndedAt.current = Date.now();
    clearTimer();
    resumeTimer.current = setTimeout(() => {
      handEndedAt.current = null;
      follow(true);
    }, LYRIC_FOLLOW_RESUME_MS);
  }, [follow]);

  /** Follow again right away, for a tap that seeks to a line. */
  const resume = useCallback(() => {
    handEndedAt.current = null;
    clearTimer();
    follow(true);
  }, [follow]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: e => {
      offset.value = e.contentOffset.y;
    },
    onBeginDrag: () => {
      driving.value = false;
      cancelAnimation(target);
      runOnJS(handStarted)();
    },
    onEndDrag: () => {
      runOnJS(handEnded)();
    },
    onMomentumEnd: () => {
      runOnJS(handEnded)();
    },
  });

  const onRowLayout = useCallback(
    (index: number, layout: RowLayout) => {
      rows.current.set(index, layout);
      if (index === activeRef.current && !placed.current) follow(false);
    },
    [follow]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      box.current.viewport = e.nativeEvent.layout.height;
      follow(placed.current);
    },
    [follow]
  );

  const onContentSizeChange = useCallback(
    (_: number, height: number) => {
      box.current.content = height;
      if (!placed.current) follow(false);
    },
    [follow]
  );

  return { scrollRef, onScroll, onRowLayout, onLayout, onContentSizeChange, resume };
}
