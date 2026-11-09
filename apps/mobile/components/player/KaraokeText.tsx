import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { useKaraokeClock } from '@/hooks/useKaraokeClock';
import { karaokeWordProgress, karaokeWords, type KaraokeWord } from '@/lib/lyrics-sync';

/** Unsung words of the sung line, as on the desktop (its idle line dimness). */
const UNSUNG_OPACITY = 0.45;
/** Rounding slack so the bright copy never ellipsizes inside its clip. */
const CLIP_SLACK = 2;

interface KaraokeTextProps {
  text: string;
  /** When the line starts, in seconds. */
  lineTime: number;
  /** Seconds the fill spans. */
  duration: number;
  /** The line's type classes; each word repeats them. */
  className: string;
  /** Space between words, in points (about a third of the font size). */
  gap: number;
}

const Word = memo(function Word({
  word,
  elapsed,
  className,
  gap,
}: {
  word: KaraokeWord;
  elapsed: SharedValue<number>;
  className: string;
  gap: number;
}) {
  const width = useSharedValue(0);
  const clip = useAnimatedStyle(() => ({
    width: width.value * karaokeWordProgress(word, elapsed.value),
  }));
  const copy = useAnimatedStyle(() => ({ width: width.value + CLIP_SLACK }));
  return (
    <View
      style={{ marginRight: gap }}
      onLayout={e => {
        width.value = e.nativeEvent.layout.width;
      }}
    >
      <Text className={className} style={{ opacity: UNSUNG_OPACITY }}>
        {word.text}
      </Text>
      <Animated.View style={[styles.clip, clip]}>
        <Animated.View style={copy}>
          <Text className={className} numberOfLines={1}>
            {word.text}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

/**
 * The sung line, filled word by word from left to right like the desktop's
 * default "fill" style. LRC has no word timing, so each word gets a slice of
 * the line in proportion to its length. Screen readers get the line from the
 * row around it, not word by word.
 */
export function KaraokeText({ text, lineTime, duration, className, gap }: KaraokeTextProps) {
  const words = useMemo(() => karaokeWords(text, duration), [text, duration]);
  const elapsed = useKaraokeClock(lineTime, duration, true);
  return (
    <View
      style={styles.line}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {words.map((word, index) => (
        <Word
          key={index}
          word={word}
          elapsed={elapsed}
          className={className}
          gap={index < words.length - 1 ? gap : 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap' },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
});
