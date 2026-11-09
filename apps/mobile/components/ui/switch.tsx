import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MOTION, motion } from '@/lib/motion';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
}

/** Track 52 wide with 4 of padding; the thumb grows from 20 (off) to 24 (on). */
const THUMB_OFF = 20;
const THUMB_ON = 24;
const X_OFF = 2;
const X_ON = 52 - 8 - THUMB_ON;

/** Material 3 style switch in the desktop colors; the thumb slides and grows. */
export function Switch({ value, onValueChange, accessibilityLabel }: SwitchProps) {
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(value ? 1 : 0, motion(MOTION.fast));
  }, [value, on]);

  const thumbStyle = useAnimatedStyle(() => {
    const size = THUMB_OFF + (THUMB_ON - THUMB_OFF) * on.value;
    return {
      width: size,
      height: size,
      backgroundColor: interpolateColor(
        on.value,
        [0, 1],
        [colors.mutedForeground, colors.primaryForeground]
      ),
      transform: [{ translateX: X_OFF + (X_ON - X_OFF) * on.value }],
    };
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={6}
      className={cn(
        'h-8 w-[52px] justify-center rounded-full px-1',
        value ? 'bg-primary' : 'bg-switch-track'
      )}
    >
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </Pressable>
  );
}

// Reanimated views take no className (NativeWind only maps core components).
const styles = StyleSheet.create({
  thumb: { borderRadius: 999 },
});
