import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

const MIN_DISPLAY_MS = 2500;
const EXIT_DURATION_MS = 500;
const MESSAGE_ROTATE_MS = 1400;

const LOADING_MESSAGES = [
  'Tuning the airwaves...',
  'Setting up your sanctuary...',
  'Finding the right frequency...',
  'Loading your collection...',
  'Warming up the speakers...',
  'Getting cozy...',
  'Almost there...',
];

const SPARKLE_COUNT = 8;

interface SparkleData {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

function generateSparkles(): SparkleData[] {
  return Array.from({ length: SPARKLE_COUNT }, (_, i) => {
    const angle = (i / SPARKLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const radius = 40 + Math.random() * 50;
    return {
      id: i,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: 3 + Math.random() * 4,
      delay: i * 150 + Math.random() * 200,
      duration: 1200 + Math.random() * 800,
    };
  });
}

function Sparkle({ data }: { data: SparkleData }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      data.delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: data.duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: data.duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      )
    );
    scale.value = withDelay(
      data.delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: data.duration / 2 }),
          withTiming(0.3, { duration: data.duration / 2 })
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: data.size,
          height: data.size,
          borderRadius: data.size / 2,
          backgroundColor: colors.primary,
          left: '50%',
          top: '50%',
          marginLeft: data.x - data.size / 2,
          marginTop: data.y - data.size / 2,
        },
        style,
      ]}
    />
  );
}

function LogoIcon() {
  const scale = useSharedValue(0);
  const floatY = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 100, mass: 0.8 });
    floatY.value = withDelay(
      800,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: floatY.value }],
  }));

  return (
    <Animated.View style={[s.logoContainer, style]}>
      <View style={s.logoIcon}>
        <Text style={s.logoEmoji}>🌊</Text>
      </View>
    </Animated.View>
  );
}

function AnimatedSplashInner({ ready, onDismissed }: { ready: boolean; onDismissed: () => void }) {
  const [visible, setVisible] = useState(true);
  const [messageIndex, setMessageIndex] = useState(0);
  const sparkles = useMemo(() => generateSparkles(), []);

  // Rotate messages
  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, MESSAGE_ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  // Dismiss after min display + ready
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismissed, EXIT_DURATION_MS);
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [ready, onDismissed]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(EXIT_DURATION_MS)}
      style={s.container}
    >
      <View style={s.content}>
        <View style={s.logoArea}>
          {sparkles.map(sp => (
            <Sparkle key={sp.id} data={sp} />
          ))}
          <LogoIcon />
        </View>

        <Animated.Text entering={FadeIn.delay(400).duration(400)} style={s.title}>
          Shiranami
        </Animated.Text>

        <Animated.Text
          key={messageIndex}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          style={s.message}
        >
          {LOADING_MESSAGES[messageIndex]}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

export const AnimatedSplash = memo(AnimatedSplashInner);

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  logoArea: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logoEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: 1,
  },
  message: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    minHeight: 20,
  },
});
