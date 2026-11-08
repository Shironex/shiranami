import { memo, useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { colors, EASE_OUT } from '@/lib/theme';

const SPLASH_ICON = require('../assets/images/splash-icon.png');
/** Matches `imageWidth` of the expo-splash-screen plugin in app.json. */
const SPLASH_ICON_SIZE = 200;
const FADE_MS = 280;

/**
 * Holds the native splash picture on screen until the first screen can draw,
 * then fades it away. Same picture, size and color as the native splash, so
 * the hand-off does not show.
 */
function AnimatedSplashInner({ ready, onDismissed }: { ready: boolean; onDismissed: () => void }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!ready) return;
    if (reduceMotion) {
      onDismissed();
      return;
    }
    opacity.value = withTiming(
      0,
      { duration: FADE_MS, easing: Easing.bezier(...EASE_OUT) },
      finished => {
        if (finished) runOnJS(onDismissed)();
      }
    );
  }, [ready, reduceMotion, onDismissed, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View pointerEvents={ready ? 'none' : 'auto'} style={[styles.container, style]}>
      <Image
        source={SPLASH_ICON}
        accessibilityIgnoresInvertColors
        style={{ width: SPLASH_ICON_SIZE, height: SPLASH_ICON_SIZE }}
      />
    </Animated.View>
  );
}

export const AnimatedSplash = memo(AnimatedSplashInner);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
