import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { MOTION, motion } from '@/lib/motion';
import { TAB_SETTLE_GRACE_MS, tabEntryShift } from '@/lib/tab-motion';

/** With reduce motion on, a tab only fades in; the fade opts out of its skipping. */
const FADE: WithTimingConfig = {
  duration: MOTION.fast,
  easing: Easing.linear,
  reduceMotion: ReduceMotion.Never,
};

/** The dock tab last brought to the front, shared by every tab's scene. */
let lastTab: number | null = null;

interface TabNavigation {
  isFocused: () => boolean;
  getState: () => { routes: { key: string }[] };
  addListener: (event: 'focus', callback: () => void) => () => void;
}

interface TabSceneProps {
  navigation: TabNavigation;
  route: { key: string };
  children: ReactNode;
}

/**
 * Wraps each dock tab's screen. When a tab comes to the front its screen
 * fades in while drifting a little from the side it is on. The navigator
 * itself swaps screens at once: its own transition runs on the native driver
 * and could leave a screen invisible when it was detached mid-way, so this
 * one runs on Reanimated and is always put at its end state by hand if the
 * animation does not finish in time.
 */
export function TabScene({ navigation, route, children }: TabSceneProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const shift = useSharedValue(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      cancelAnimation(opacity);
      cancelAnimation(shift);
      opacity.value = 1;
      shift.value = 0;
    };
    const enter = () => {
      if (!navigation.isFocused()) return;
      const index = navigation.getState().routes.findIndex(r => r.key === route.key);
      const from = tabEntryShift(lastTab, index);
      lastTab = index;
      if (from === null) return;
      const config = reduceMotion ? FADE : motion(MOTION.base);
      opacity.value = 0;
      shift.value = reduceMotion ? 0 : from;
      opacity.value = withTiming(1, config);
      shift.value = withTiming(0, config);
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, (config.duration ?? MOTION.base) + TAB_SETTLE_GRACE_MS);
    };
    // A tab mounts on its first visit already focused, maybe before the event.
    enter();
    const unsubscribe = navigation.addListener('focus', enter);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      settle();
    };
  }, [navigation, route.key, reduceMotion, opacity, shift]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: shift.value }],
  }));

  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
