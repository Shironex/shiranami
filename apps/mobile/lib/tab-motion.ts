import { Animated, Easing } from 'react-native';
import { EASE_OUT_EXPO } from '@/lib/theme';
import { MOTION } from '@/lib/motion';

/** How far a tab's screen drifts sideways while it fades in or out. */
const TAB_SHIFT = 16;

interface SceneProgress {
  current: { progress: Animated.AnimatedInterpolation<number> };
}

/**
 * Switching dock tabs: the new screen fades in while drifting a little from
 * the side it is on, the old one fades out the other way. The navigator runs
 * this on the core Animated API, hence the React Native easing.
 */
export const TAB_TRANSITION = {
  animation: 'shift',
  transitionSpec: {
    animation: 'timing',
    config: { duration: MOTION.base, easing: Easing.bezier(...EASE_OUT_EXPO) },
  },
  sceneStyleInterpolator: ({ current }: SceneProgress) => ({
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-TAB_SHIFT, 0, TAB_SHIFT],
          }),
        },
      ],
    },
  }),
} as const;

/** With reduce motion on, tabs cross fade instead. */
export const TAB_TRANSITION_REDUCED = {
  animation: 'fade',
  transitionSpec: {
    animation: 'timing',
    config: { duration: MOTION.fast, easing: Easing.linear },
  },
} as const;
