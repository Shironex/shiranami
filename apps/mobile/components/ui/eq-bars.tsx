import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import { EASE_OUT, colors } from '@/lib/theme';

const BARS = [
  { rest: 0.55, delay: 0 },
  { rest: 1, delay: 400 },
  { rest: 0.35, delay: 700 },
  { rest: 0.7, delay: 200 },
] as const;

const HEIGHT = 14;

function Bar({ rest, delay, moving }: { rest: number; delay: number; moving: boolean }) {
  const scale = useSharedValue(rest);
  useEffect(() => {
    if (!moving) {
      cancelAnimation(scale);
      scale.value = rest;
      return;
    }
    scale.value = withDelay(
      delay,
      withRepeat(withTiming(0.35, { duration: 1100, easing: Easing.bezier(...EASE_OUT) }), -1, true)
    );
  }, [moving, rest, delay, scale]);
  // A transform, not a height: a height change is a layout pass every frame
  // for as long as the song plays.
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Animated.View style={[BAR, style]} />;
}

const BAR = {
  width: 3,
  height: HEIGHT,
  borderRadius: 1.5,
  backgroundColor: colors.primary,
  transformOrigin: 'bottom',
} as const;

/**
 * The "now playing" bars. Still when paused, when the system asks for less
 * motion, and when the screen is not in front (a tab in the background or a
 * list under the player), since nobody sees them move there.
 */
export function EqBars({ playing }: { playing: boolean }) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  return (
    <View
      accessibilityLabel={playing ? 'Playing' : 'Paused'}
      className="h-3.5 w-4 flex-row items-end gap-0.5"
    >
      {BARS.map(bar => (
        <Bar key={bar.delay} {...bar} moving={playing && focused && !reduceMotion} />
      ))}
    </View>
  );
}
