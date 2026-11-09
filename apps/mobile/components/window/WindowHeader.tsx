import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scrim } from '@/components/art/Scrim';
import { ThemePhoto } from '@/components/art/ThemePhoto';
import { Text } from '@/components/ui/text';
import type { ThemePhotoName } from '@/lib/photos';
import { colors } from '@/lib/theme';

/** Window height at rest and once the list has scrolled under it. */
export const WINDOW_EXPANDED = 172;
export const WINDOW_COLLAPSED = 64;
const COLLAPSE_DISTANCE = WINDOW_EXPANDED - WINDOW_COLLAPSED;
const TOP_GAP = 8;
/** Space under the window; rows scroll under the background there. */
const BOTTOM_GAP = 8;
const TITLE_COLLAPSED_SCALE = 0.72;
/** Height of the subtitle line, which the title drops into as it fades. */
const SUBTITLE_SHIFT = 22;
/** Collapsed, the title moves right of the back button. */
const LEADING_SHIFT = 40;

const SCRIM = [
  { at: 0, color: colors.shade, opacity: 0.1 },
  { at: 0.45, color: colors.shade, opacity: 0.2 },
  { at: 1, color: colors.shade, opacity: 0.82 },
] as const;

/** Scroll position for a list that sits under a window header. */
export function useWindowScroll() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });
  return { scrollY, onScroll };
}

/** Top padding a list needs so its first row starts under the expanded window. */
export function useWindowInset(): number {
  return useSafeAreaInsets().top + TOP_GAP + WINDOW_EXPANDED + BOTTOM_GAP;
}

interface WindowHeaderProps {
  title: string;
  subtitle?: string;
  scrollY: SharedValue<number>;
  /** Top right, over the photo: search, the avatar. */
  actions?: ReactNode;
  /** Top left, for pushed screens. */
  leading?: ReactNode;
  /** Bottom right, over the photo: the round Play and Shuffle. Fades as the window collapses. */
  footer?: ReactNode;
  photo?: ThemePhotoName;
  /** A cover to show instead of a theme photo (artist pages). */
  imageUri?: string;
  focusX?: number;
  focusY?: number;
}

/**
 * The theme photo as a framed window at the top of a screen, like the sill in
 * the desktop photos. It collapses to a slim bar as the list scrolls; the
 * photo drifts up at half speed so the frame does not feel like a crop.
 */
export function WindowHeader({
  title,
  subtitle,
  scrollY,
  actions,
  leading,
  footer,
  photo = 'lofi-night',
  imageUri,
  focusX = 70,
  focusY = 38,
}: WindowHeaderProps) {
  const insets = useSafeAreaInsets();

  const frameStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [0, COLLAPSE_DISTANCE],
      [WINDOW_EXPANDED, WINDOW_COLLAPSED],
      Extrapolation.CLAMP
    ),
  }));
  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COLLAPSE_DISTANCE],
          [0, -COLLAPSE_DISTANCE / 2],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
  // The scrim keeps the expanded height and rides up with the frame's bottom
  // edge, so collapsed it still darkens behind the title. An SVG redraws its
  // bitmap whenever its size changes, so it never resizes while scrolling.
  const scrimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COLLAPSE_DISTANCE],
          [0, -COLLAPSE_DISTANCE],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
  const titleStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: leading ? t * LEADING_SHIFT : 0 },
        { translateY: subtitle ? t * SUBTITLE_SHIFT : t * 4 },
        { scale: 1 - (1 - TITLE_COLLAPSED_SCALE) * t },
      ],
    };
  });
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE * 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  const footerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE * 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  // Faded out, the buttons stop taking taps meant for the slim bar.
  const footerProps = useAnimatedProps(() => ({
    pointerEvents: (scrollY.value > COLLAPSE_DISTANCE * 0.45 ? 'none' : 'box-none') as
      'none' | 'box-none',
  }));

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 z-10 bg-background px-4"
      style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: BOTTOM_GAP }}
    >
      <Animated.View style={[styles.frame, frameStyle]}>
        <Animated.View style={[styles.photo, photoStyle]}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <ThemePhoto photo={photo} x={focusX} y={focusY} className="flex-1" />
          )}
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]}>
          <Scrim stops={SCRIM} />
        </Animated.View>
        <Animated.View style={[styles.title, titleStyle]}>
          <Text variant="display" numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Animated.View style={subtitleStyle}>
              <Text variant="meta" className="mt-1 text-[14px] text-soft-foreground">
                {subtitle}
              </Text>
            </Animated.View>
          )}
        </Animated.View>
        {footer && (
          <Animated.View style={[styles.footer, footerStyle]} animatedProps={footerProps}>
            {footer}
          </Animated.View>
        )}
        {leading && <View className="absolute left-2.5 top-2.5">{leading}</View>}
        {actions && (
          <View className="absolute right-2.5 top-2.5 flex-row items-center gap-1">{actions}</View>
        )}
      </Animated.View>
    </View>
  );
}

// Reanimated views take no className (NativeWind only maps core components).
const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  photo: { position: 'absolute', left: 0, right: 0, top: 0, height: WINDOW_EXPANDED },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, height: WINDOW_EXPANDED },
  title: { position: 'absolute', left: 20, right: 96, bottom: 16, transformOrigin: 'left bottom' },
  footer: { position: 'absolute', right: 14, bottom: 14, flexDirection: 'row', gap: 8 },
});
