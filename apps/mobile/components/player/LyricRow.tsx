import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type LyricLineState = 'past' | 'now' | 'next';

interface LyricRowProps {
  text: string;
  state: LyricLineState;
  /** `card` is the smaller set inside the player's lyrics card. */
  size?: 'full' | 'card';
  onPress?: () => void;
}

const OPACITY: Record<LyricLineState, number> = { past: 0.45, now: 1, next: 0.6 };

/** One lyric line: the sung line full white, the others dimmed. Tap to play from it. */
export const LyricRow = memo(function LyricRow({
  text,
  state,
  size = 'full',
  onPress,
}: LyricRowProps) {
  const card = size === 'card';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityHint={onPress ? 'Plays from this line' : undefined}
      className={cn('rounded-lg px-1 active:bg-border', card ? 'py-[5px]' : 'py-[11px]')}
    >
      <Text
        className={cn(
          card
            ? 'font-display text-[19px] leading-[26px] tracking-[-0.19px]'
            : state === 'now'
              ? 'font-display text-[24px] leading-[31px] tracking-[-0.24px]'
              : 'font-display-medium text-[20px] leading-[28px] tracking-[-0.2px]'
        )}
        style={{ opacity: card && state !== 'now' ? 0.4 : OPACITY[state] }}
      >
        {text}
      </Text>
    </Pressable>
  );
});
