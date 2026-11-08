import { memo, type ReactNode } from 'react';
import Heart from 'lucide-react-native/icons/heart';
import { ArtTile } from '@/components/art/ArtTile';
import { SwipeRow } from '@/components/library/SwipeRow';
import { EqBars } from '@/components/ui/eq-bars';
import { ListRow, RowMeta } from '@/components/ui/list-row';
import { formatDuration } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useSwipeQueue } from '@/hooks/useSwipeQueue';
import { trackMeta } from '@/lib/track-meta';
import type { Track } from '@/stores/usePlayerStore';

interface TrackRowProps {
  track: Track;
  active: boolean;
  playing: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Buttons beside the row (queue: play next, remove); they replace the heart and duration. */
  actions?: ReactNode;
  meta?: string;
  /** Swipe right to play next, left to add to a playlist. */
  swipeable?: boolean;
}

function DefaultEnd({
  track,
  active,
  playing,
}: Pick<TrackRowProps, 'track' | 'active' | 'playing'>) {
  if (active) return <EqBars playing={playing} />;
  return (
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
  );
}

/** A song in a list: art, title, artist and album, then eq bars or heart and duration. */
function TrackRowInner({
  track,
  active,
  playing,
  onPress,
  onLongPress,
  actions,
  meta,
  swipeable,
}: TrackRowProps) {
  const swipe = useSwipeQueue();
  const renderRow = (press: () => void, longPress?: () => void) => (
    <ListRow
      art={<ArtTile title={track.title} artUri={track.albumArt} />}
      title={track.title}
      meta={meta ?? trackMeta(track)}
      active={active}
      end={
        actions && !active ? null : <DefaultEnd track={track} active={active} playing={playing} />
      }
      actions={active ? undefined : actions}
      onPress={press}
      onLongPress={longPress}
      accessibilityHint={onLongPress ? 'Long press for more' : undefined}
    />
  );
  if (!swipeable) return renderRow(onPress, onLongPress);
  return (
    <SwipeRow
      onPlayNext={() => swipe.playNext(track)}
      onAddToPlaylist={() => swipe.addToPlaylist(track)}
    >
      {guard => renderRow(guard(onPress), onLongPress && guard(onLongPress))}
    </SwipeRow>
  );
}

export const TrackRow = memo(TrackRowInner);
