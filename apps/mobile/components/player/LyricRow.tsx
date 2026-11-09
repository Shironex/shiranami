import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KaraokeText } from '@/components/player/KaraokeText';
import { Text } from '@/components/ui/text';
import type { LyricLineState, RowLayout } from '@/lib/lyrics-sync';
import { MOTION, motion } from '@/lib/motion';
import { cn } from '@/lib/utils';

export type { LyricLineState };

/** `plain` is a line of unsynced lyrics: readable, never highlighted. */
export type LyricRowState = LyricLineState | 'plain';
export type LyricRowSize = 'full' | 'card';

interface Look {
  opacity: number;
  scale: number;
}

/**
 * Every line is set at the sung size and the others are scaled down from
 * their left edge, so the active line can grow without reflowing the list.
 */
const LOOKS: Record<LyricRowSize, Record<LyricRowState, Look>> = {
  full: {
    past: { opacity: 0.38, scale: 0.84 },
    now: { opacity: 1, scale: 1 },
    next: { opacity: 0.58, scale: 0.84 },
    plain: { opacity: 0.86, scale: 0.84 },
  },
  card: {
    past: { opacity: 0.34, scale: 0.9 },
    now: { opacity: 1, scale: 1 },
    next: { opacity: 0.52, scale: 0.9 },
    plain: { opacity: 0.8, scale: 0.9 },
  },
};

const TYPE: Record<LyricRowSize, { className: string; gap: number; row: string }> = {
  full: {
    className: 'font-display text-[24px] leading-[31px] tracking-[-0.24px]',
    gap: 7,
    row: 'py-[10px]',
  },
  card: {
    className: 'font-display text-[20px] leading-[27px] tracking-[-0.2px]',
    gap: 6,
    row: 'py-[6px]',
  },
};

interface LyricRowProps {
  index: number;
  text: string;
  state: LyricRowState;
  /** `card` is the smaller set inside the player's lyrics card. */
  size?: LyricRowSize;
  /** When the line starts; with `onSeek`, a tap plays from here. */
  time?: number;
  onSeek?: (time: number) => void;
  /** Set on the sung line only: seconds its karaoke fill spans. */
  karaoke?: number;
  onRowLayout?: (index: number, layout: RowLayout) => void;
}

/**
 * One lyric line. The sung line brightens and grows a little, the lines
 * around it dim, all on one eased transition. With `karaoke` the sung line
 * also fills word by word as it is sung.
 */
export const LyricRow = memo(function LyricRow({
  index,
  text,
  state,
  size = 'full',
  time,
  onSeek,
  karaoke,
  onRowLayout,
}: LyricRowProps) {
  const look = LOOKS[size][state];
  const type = TYPE[size];
  const opacity = useSharedValue(look.opacity);
  const scale = useSharedValue(look.scale);

  useEffect(() => {
    opacity.value = withTiming(look.opacity, motion(MOTION.slow));
    scale.value = withTiming(look.scale, motion(MOTION.slow));
  }, [look, opacity, scale]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const seekable = onSeek !== undefined && time !== undefined;
  const onLayout = onRowLayout
    ? (e: LayoutChangeEvent) => {
        const { y, height } = e.nativeEvent.layout;
        onRowLayout(index, { y, height });
      }
    : undefined;

  return (
    <Pressable
      onPress={seekable ? () => onSeek(time) : undefined}
      disabled={!seekable}
      onLayout={onLayout}
      accessibilityRole={seekable ? 'button' : 'text'}
      accessibilityLabel={text}
      accessibilityHint={seekable ? 'Plays from this line' : undefined}
      accessibilityState={state === 'now' ? { selected: true } : undefined}
      className={cn('rounded-lg px-1 active:bg-border', type.row)}
    >
      <Animated.View style={[styles.line, animated]}>
        {karaoke !== undefined && time !== undefined ? (
          <KaraokeText
            text={text}
            lineTime={time}
            duration={karaoke}
            className={type.className}
            gap={type.gap}
          />
        ) : (
          <Text className={type.className}>{text}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  line: { transformOrigin: 'left center' },
});
