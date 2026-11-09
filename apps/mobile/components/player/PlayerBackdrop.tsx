import { memo, useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/lib/theme';

/**
 * The player's soft lavender glow from the top, as in the desktop now-playing
 * view. On Android an SVG is drawn into a bitmap, so this is memoized and the
 * player keeps it at one size: every redraw costs a full screen bitmap upload.
 */
export const PlayerBackdrop = memo(function PlayerBackdrop() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      preserveAspectRatio="none"
    >
      <Defs>
        {/* CSS radial-gradient(120% 55% at 50% 0%): a unit circle at the top
            centre, stretched by a transform, since SVG has no rx/ry on web. */}
        <RadialGradient
          id={id}
          cx="0.5"
          cy="0"
          fx="0.5"
          fy="0"
          r="1"
          gradientTransform="translate(0.5 0) scale(1.2 0.55) translate(-0.5 0)"
        >
          <Stop offset="0" stopColor={colors.playerGlow} />
          <Stop offset="0.5" stopColor={colors.playerMid} />
          <Stop offset="0.85" stopColor={colors.background} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={colors.background} />
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
});
