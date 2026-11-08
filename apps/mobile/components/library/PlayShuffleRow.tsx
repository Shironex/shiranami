import type { ReactNode } from 'react';
import { View } from 'react-native';
import Play from 'lucide-react-native/icons/play';
import Shuffle from 'lucide-react-native/icons/shuffle';
import { Button } from '@/components/ui/button';

interface PlayShuffleRowProps {
  onPlay: () => void;
  onShuffle: () => void;
  disabled?: boolean;
  /** Trailing control, e.g. Sort. */
  end?: ReactNode;
}

/** Play and Shuffle for the whole list, with room for one control on the right. */
export function PlayShuffleRow({ onPlay, onShuffle, disabled, end }: PlayShuffleRowProps) {
  return (
    <View className="flex-row items-center gap-2">
      <Button
        label="Play"
        icon={Play}
        iconFilled
        size="compact"
        onPress={onPlay}
        disabled={disabled}
      />
      <Button
        label="Shuffle"
        icon={Shuffle}
        variant="tonal"
        size="compact"
        onPress={onShuffle}
        disabled={disabled}
      />
      <View className="flex-1" />
      {end}
    </View>
  );
}
