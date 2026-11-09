import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { ArtTile } from '@/components/art/ArtTile';
import { Text } from '@/components/ui/text';
import type { Track } from '@/stores/usePlayerStore';

interface CardRowProps {
  track: Track;
  /** Under the title; the artist when not given. */
  meta?: string;
  onPress: (track: Track) => void;
  onLongPress?: (track: Track) => void;
}

/** A compact song row for the player card's up next and similar lists. */
export const CardRow = memo(function CardRow({ track, meta, onPress, onLongPress }: CardRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title}`}
      accessibilityHint={onLongPress ? 'Long press for more' : undefined}
      onPress={() => onPress(track)}
      onLongPress={onLongPress ? () => onLongPress(track) : undefined}
      className="min-h-[58px] flex-row items-center gap-3 rounded-lg px-1 active:bg-border active:opacity-80"
    >
      <ArtTile title={track.title} artUri={track.albumArt} size={42} radius={10} />
      <View className="min-w-0 flex-1">
        <Text variant="rowTitle" numberOfLines={1} className="text-[15px]">
          {track.title}
        </Text>
        <Text variant="meta" numberOfLines={1} className="text-[13px]">
          {meta ?? track.artist}
        </Text>
      </View>
    </Pressable>
  );
});

/** A quiet line in the middle of the card when there is nothing to list. */
export function CardQuiet({ children }: { children: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text variant="bodyMuted" className="text-center">
        {children}
      </Text>
    </View>
  );
}
