import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash from 'lucide-react-native/icons/trash';
import { PlayShuffleRow } from '@/components/library/PlayShuffleRow';
import { TrackRow } from '@/components/library/TrackRow';
import { useDockInset } from '@/components/nav/Dock';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { playlistMeta, usePlaylist } from '@/hooks/usePlaylists';
import { useListAppear } from '@/hooks/useListAppear';
import { colors } from '@/lib/theme';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { usePlaylistStore } from '@/stores/usePlaylistStore';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { playlist, tracks } = usePlaylist(id);
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const bottomInset = useDockInset();
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playFromList = usePlayerStore(s => s.playFromList);
  const playShuffled = usePlayerStore(s => s.playShuffled);
  const name = playlist?.name ?? '';

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackRow
        swipeable
        track={item}
        active={item.id === currentTrackId}
        playing={isPlaying}
        onPress={() => playFromList(tracks, index, name)}
        onLongPress={() =>
          router.push({ pathname: '/track/[id]', params: { id: item.id, playlist: id } })
        }
      />
    ),
    [currentTrackId, isPlaying, playFromList, tracks, name, router, id]
  );
  const renderRow = useListAppear(renderItem, tracks.length > 0);

  if (!playlist) return <View className="flex-1 bg-background" />;

  const confirmDelete = () =>
    Alert.alert(`Delete "${name}"?`, 'The songs stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          router.back();
          await usePlaylistStore.getState().remove(db, playlist.id);
        },
      },
    ]);

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={tracks}
        renderItem={renderRow}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          tracks.length > 0 ? (
            <View className="px-3 pb-2 pt-3">
              <PlayShuffleRow
                onPlay={() => playFromList(tracks, 0, name)}
                onShuffle={() => playShuffled(tracks, name)}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="No songs yet"
            body="Long press a song in the Library and pick Add to playlist."
          />
        }
        contentContainerStyle={{
          paddingTop: topInset,
          paddingHorizontal: 4,
          paddingBottom: bottomInset,
        }}
      />
      <WindowHeader
        title={name}
        subtitle={playlistMeta(tracks)}
        photo="wisteria"
        focusY={18}
        scrollY={scrollY}
        leading={
          <IconButton
            icon={ArrowLeft}
            color={colors.foreground}
            accessibilityLabel="Back to playlists"
            onPress={() => router.back()}
          />
        }
        actions={
          <>
            <IconButton
              icon={Pencil}
              size={20}
              color={colors.foreground}
              accessibilityLabel="Rename playlist"
              onPress={() =>
                router.push({ pathname: '/playlist-name', params: { id: playlist.id } })
              }
            />
            <IconButton
              icon={Trash}
              size={20}
              color={colors.foreground}
              accessibilityLabel="Delete playlist"
              onPress={confirmDelete}
            />
          </>
        }
      />
    </View>
  );
}
