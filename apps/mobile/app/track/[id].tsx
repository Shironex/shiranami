import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Heart from 'lucide-react-native/icons/heart';
import ListEnd from 'lucide-react-native/icons/list-end';
import ListMinus from 'lucide-react-native/icons/list-minus';
import ListPlus from 'lucide-react-native/icons/list-plus';
import ListStart from 'lucide-react-native/icons/list-start';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { ArtTile } from '@/components/art/ArtTile';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useRemoveTrack } from '@/hooks/useRemoveTrack';
import { useToggleFavorite } from '@/hooks/useToggleFavorite';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { usePlaylistStore } from '@/stores/usePlaylistStore';

function Action({
  icon: Icon,
  label,
  color = colors.softForeground,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-14 flex-row items-center gap-4 px-6 active:bg-border"
    >
      <Icon size={22} color={color} fill={color === colors.favorite ? color : 'transparent'} />
      <Text variant="option">{label}</Text>
    </Pressable>
  );
}

/** Long-press actions for one song. From a playlist it can also leave that playlist. */
export default function TrackActionsSheet() {
  const { id, playlist } = useLocalSearchParams<{ id: string; playlist?: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const track = usePlayerStore(s => s.library.find(t => t.id === id));
  // Queue actions only make sense while songs play, and not for the one playing.
  const canQueue = usePlayerStore(
    s => !!s.currentTrack && !s.currentTrack.isLive && s.currentTrack.id !== id
  );
  const toggleFavorite = useToggleFavorite();
  const removeTrack = useRemoveTrack();

  if (!track) return <View className="h-24 bg-sheet" />;

  const done = (action: () => void) => () => {
    action();
    router.back();
  };
  const player = usePlayerStore.getState;

  return (
    <View className="bg-sheet" style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
      <View className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-handle" />
      <View className="flex-row items-center gap-3.5 px-6 pb-3 pt-5">
        <ArtTile title={track.title} artUri={track.albumArt} />
        <View className="min-w-0 flex-1">
          <Text variant="rowTitle" numberOfLines={1}>
            {track.title}
          </Text>
          <Text variant="meta" numberOfLines={1} className="mt-0.5">
            {track.artist}
          </Text>
        </View>
      </View>
      <View className="mx-6 mb-2 h-px bg-border" />
      {canQueue && (
        <>
          <Action
            icon={ListStart}
            label="Play next"
            onPress={done(() => player().playNext(track))}
          />
          <Action
            icon={ListEnd}
            label="Add to queue"
            onPress={done(() => player().addToQueue([track]))}
          />
        </>
      )}
      <Action
        icon={ListPlus}
        label="Add to playlist"
        onPress={() =>
          router.replace({ pathname: '/add-to-playlist', params: { trackId: track.id } })
        }
      />
      {playlist && (
        <Action
          icon={ListMinus}
          label="Remove from this playlist"
          onPress={done(() => usePlaylistStore.getState().removeTrack(db, playlist, track.id))}
        />
      )}
      <Action
        icon={Heart}
        label={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        color={track.isFavorite ? colors.favorite : colors.softForeground}
        onPress={done(() => toggleFavorite(track.id))}
      />
      <Action
        icon={Trash2}
        label="Remove from library"
        color={colors.destructive}
        onPress={done(() => removeTrack(track))}
      />
    </View>
  );
}
