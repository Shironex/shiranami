import { memo } from 'react';
import { View } from 'react-native';
import Heart from 'lucide-react-native/icons/heart';
import { SwipeRow } from '@/components/library/SwipeRow';
import { EqBars } from '@/components/ui/eq-bars';
import { ListRow, RowMeta } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { useSwipeQueue } from '@/hooks/useSwipeQueue';
import { formatDuration } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { Track } from '@/stores/usePlayerStore';

interface NumberedRowProps {
  track: Track;
  number: number;
  active: boolean;
  playing: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

/**
 * An album song: its track number instead of the cover every row would repeat.
 * Swipe right to play it next, left to add it to a playlist.
 */
export const NumberedRow = memo(function NumberedRow({
  track,
  number,
  active,
  playing,
  onPress,
  onLongPress,
}: NumberedRowProps) {
  const swipe = useSwipeQueue();
  return (
    <SwipeRow
      onPlayNext={() => swipe.playNext(track)}
      onAddToPlaylist={() => swipe.addToPlaylist(track)}
    >
      {guard => (
        <ListRow
          art={
            <View className="h-10 w-6 items-center justify-center">
              {active ? (
                <EqBars playing={playing} />
              ) : (
                <Text
                  variant="meta"
                  className="text-[14px]"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {String(number)}
                </Text>
              )}
            </View>
          }
          title={track.title}
          active={active}
          end={
            <>
              {track.isFavorite && (
                <Heart
                  size={18}
                  color={colors.favorite}
                  fill={colors.favorite}
                  accessibilityLabel="Favorite"
                />
              )}
              {track.duration > 0 && <RowMeta>{formatDuration(track.duration)}</RowMeta>}
            </>
          }
          onPress={guard(onPress)}
          onLongPress={onLongPress && guard(onLongPress)}
          accessibilityHint={onLongPress ? 'Long press for more' : undefined}
        />
      )}
    </SwipeRow>
  );
});
