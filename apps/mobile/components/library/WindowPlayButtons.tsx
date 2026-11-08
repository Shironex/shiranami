import { Pressable } from 'react-native';
import Play from 'lucide-react-native/icons/play';
import Shuffle from 'lucide-react-native/icons/shuffle';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface WindowPlayButtonsProps {
  onPlay: () => void;
  onShuffle: () => void;
  disabled?: boolean;
}

/** Round Shuffle and Play on the window header: the main action sits on the window. */
export function WindowPlayButtons({ onPlay, onShuffle, disabled }: WindowPlayButtonsProps) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Shuffle all"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onShuffle}
        className={cn(
          'h-11 w-11 items-center justify-center self-center rounded-full border border-border-strong bg-background/60 active:bg-border',
          disabled && 'opacity-50'
        )}
      >
        <Shuffle size={19} color={colors.foreground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play all"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPlay}
        className={cn(
          'h-[52px] w-[52px] items-center justify-center rounded-full bg-primary active:opacity-90',
          disabled && 'opacity-50'
        )}
        style={{ boxShadow: '0 10px 24px -8px rgba(0,0,4,0.9)' }}
      >
        <Play
          size={22}
          color={colors.primaryForeground}
          fill={colors.primaryForeground}
          strokeWidth={1.5}
          style={{ marginLeft: 2 }}
        />
      </Pressable>
    </>
  );
}
