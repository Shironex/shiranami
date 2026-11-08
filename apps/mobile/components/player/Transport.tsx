import { Pressable, View } from 'react-native';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import Repeat from 'lucide-react-native/icons/repeat';
import Repeat1 from 'lucide-react-native/icons/repeat-1';
import Shuffle from 'lucide-react-native/icons/shuffle';
import SkipBack from 'lucide-react-native/icons/skip-back';
import SkipForward from 'lucide-react-native/icons/skip-forward';
import { IconButton } from '@/components/ui/icon-button';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/stores/usePlayerStore';

const REPEAT_LABEL = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' } as const;

function PlayButton({ size }: { size: number }) {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const Icon = isPlaying ? Pause : Play;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      onPress={togglePlay}
      className="items-center justify-center rounded-full bg-primary active:opacity-90"
      style={{ width: size, height: size }}
    >
      <Icon
        size={Math.round(size * 0.42)}
        color={colors.primaryForeground}
        fill={colors.primaryForeground}
        strokeWidth={1.5}
      />
    </Pressable>
  );
}

/** Shuffle, previous, play, next, repeat. Radio gets the play button alone. */
export function Transport({ playSize = 72 }: { playSize?: number }) {
  const isLive = usePlayerStore(s => s.currentTrack?.isLive ?? false);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const cycleRepeatMode = usePlayerStore(s => s.cycleRepeatMode);
  const previous = usePlayerStore(s => s.previous);
  const next = usePlayerStore(s => s.next);

  if (isLive) {
    return (
      <View className="items-center">
        <PlayButton size={playSize} />
      </View>
    );
  }

  return (
    <View className="flex-row items-center justify-between">
      <IconButton
        icon={Shuffle}
        accessibilityLabel={isShuffled ? 'Shuffle on' : 'Shuffle off'}
        accessibilityState={{ selected: isShuffled }}
        color={isShuffled ? colors.primary : colors.mutedForeground}
        onPress={toggleShuffle}
        className="h-[52px] w-[52px]"
      />
      <IconButton
        icon={SkipBack}
        filled
        size={26}
        color={colors.foreground}
        accessibilityLabel="Previous"
        onPress={previous}
        className="h-[52px] w-[52px]"
      />
      <PlayButton size={playSize} />
      <IconButton
        icon={SkipForward}
        filled
        size={26}
        color={colors.foreground}
        accessibilityLabel="Next"
        onPress={next}
        className="h-[52px] w-[52px]"
      />
      <IconButton
        icon={repeatMode === 'one' ? Repeat1 : Repeat}
        accessibilityLabel={REPEAT_LABEL[repeatMode]}
        accessibilityState={{ selected: repeatMode !== 'off' }}
        color={repeatMode === 'off' ? colors.mutedForeground : colors.primary}
        onPress={cycleRepeatMode}
        className={cn('h-[52px] w-[52px]')}
      />
    </View>
  );
}
