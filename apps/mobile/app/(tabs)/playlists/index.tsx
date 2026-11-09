import { useCallback, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Plus from 'lucide-react-native/icons/plus';
import { useDockInset } from '@/components/nav/Dock';
import { FavoritesCard, NewPlaylistCard, PlaylistCard } from '@/components/playlists/PlaylistCard';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { playlistMeta, usePlaylists } from '@/hooks/usePlaylists';
import { useListAppear } from '@/hooks/useListAppear';
import { countLabel } from '@/lib/format';
import { mosaicCovers, playlistRows, type PlaylistCell } from '@/lib/playlist-grid';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

type Entry = ReturnType<typeof usePlaylists>[number];
type Row = PlaylistCell<Entry>[];

const ROW_GAP = 18;
const COLUMN_GAP = 12;
/** Header padding plus list padding on each side of the screen. */
const SIDE = 16;

export default function PlaylistsScreen() {
  const bottomInset = useDockInset();
  const router = useRouter();
  const entries = usePlaylists();
  const library = usePlayerStore(s => s.library);
  const { width } = useWindowDimensions();
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const create = useCallback(() => router.push('/playlist-name'), [router]);

  const size = Math.floor((width - SIDE * 2 - COLUMN_GAP) / 2);
  const favorites = useMemo(() => library.filter(t => t.isFavorite).length, [library]);
  const rows = useMemo(() => playlistRows(entries), [entries]);

  const renderCell = useCallback(
    (cell: PlaylistCell<Entry>) => {
      switch (cell.type) {
        case 'favorites':
          return (
            <FavoritesCard
              key={cell.key}
              meta={countLabel(favorites, 'song', 'songs')}
              size={size}
              onPress={() =>
                router.navigate({
                  pathname: '/(tabs)/(library)',
                  params: { filter: 'favorites', at: String(Date.now()) },
                })
              }
            />
          );
        case 'new':
          return <NewPlaylistCard key={cell.key} size={size} onPress={create} />;
        case 'playlist':
          return (
            <PlaylistCard
              key={cell.key}
              name={cell.entry.playlist.name}
              meta={playlistMeta(cell.entry.tracks)}
              covers={mosaicCovers(cell.entry.tracks)}
              size={size}
              onPress={() =>
                router.push({
                  pathname: '/playlists/[id]',
                  params: { id: cell.entry.playlist.id },
                })
              }
            />
          );
      }
    },
    [favorites, size, router, create]
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <View className="flex-row px-3" style={{ gap: COLUMN_GAP, marginBottom: ROW_GAP }}>
        {item.map(renderCell)}
      </View>
    ),
    [renderCell]
  );
  const renderRow = useListAppear(renderItem, rows.length > 0);

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={row => row[0].key}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View className="h-3.5" />}
        ListFooterComponent={
          entries.length === 0 ? (
            <Text variant="bodyMuted" className="px-4 text-center text-[14px]">
              Make a playlist, then long press any song to add it.
            </Text>
          ) : null
        }
        contentContainerStyle={{
          paddingTop: topInset,
          paddingHorizontal: 4,
          paddingBottom: bottomInset,
        }}
      />
      <WindowHeader
        title="Playlists"
        subtitle={countLabel(entries.length, 'playlist', 'playlists')}
        photo="wisteria"
        focusY={18}
        scrollY={scrollY}
        actions={
          <>
            <IconButton
              icon={Plus}
              color={colors.foreground}
              accessibilityLabel="New playlist"
              onPress={create}
            />
            <Avatar />
          </>
        }
      />
    </View>
  );
}
