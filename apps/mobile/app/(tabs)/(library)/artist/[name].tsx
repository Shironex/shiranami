import { useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { AlbumCard } from '@/components/library/AlbumCard';
import { SectionHeader } from '@/components/library/SectionHeader';
import { TrackRow } from '@/components/library/TrackRow';
import { WindowPlayButtons } from '@/components/library/WindowPlayButtons';
import { useDockInset } from '@/components/nav/Dock';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { groupAlbums, hasAlbum } from '@/lib/albums';
import { countLabel } from '@/lib/format';
import { colors } from '@/lib/theme';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

const SHELF_COVER = 128;

/** An artist: the window takes their cover, albums sit on a shelf, songs follow. */
export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const bottomInset = useDockInset();
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const library = usePlayerStore(s => s.library);
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playFromList = usePlayerStore(s => s.playFromList);
  const playShuffled = usePlayerStore(s => s.playShuffled);

  const tracks = useMemo(() => library.filter(t => t.artist === name), [library, name]);
  const albums = useMemo(() => groupAlbums(tracks), [tracks]);
  const cover = albums.find(a => a.art)?.art ?? tracks.find(t => t.albumArt)?.albumArt;

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackRow
        track={item}
        active={item.id === currentTrackId}
        playing={isPlaying}
        meta={hasAlbum(item) ? item.album : undefined}
        onPress={() => playFromList(tracks, index, name)}
        onLongPress={() => router.push({ pathname: '/track/[id]', params: { id: item.id } })}
      />
    ),
    [currentTrackId, isPlaying, playFromList, tracks, name, router]
  );

  const header = (
    <View>
      {albums.length > 0 && (
        <>
          <SectionHeader title="Albums" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 12 }}
          >
            {albums.map(album => (
              <AlbumCard
                key={album.key}
                title={album.title}
                meta={[album.year, countLabel(album.tracks.length, 'song', 'songs')]
                  .filter(Boolean)
                  .join(' · ')}
                artUri={album.art}
                size={SHELF_COVER}
                onPress={() =>
                  router.push({
                    pathname: '/album/[title]',
                    params: { title: album.title, artist: album.artist },
                  })
                }
              />
            ))}
          </ScrollView>
        </>
      )}
      {tracks.length > 0 && (
        <SectionHeader title="Songs" action="Shuffle" onAction={() => playShuffled(tracks, name)} />
      )}
    </View>
  );

  const subtitle = [
    albums.length > 0 ? countLabel(albums.length, 'album', 'albums') : null,
    countLabel(tracks.length, 'song', 'songs'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={tracks}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState title="No songs by this artist" body="Their songs left the library." />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topInset - 12,
          paddingHorizontal: 4,
          paddingBottom: bottomInset,
        }}
      />
      <WindowHeader
        title={name}
        subtitle={subtitle}
        imageUri={cover}
        scrollY={scrollY}
        leading={
          <IconButton
            icon={ArrowLeft}
            color={colors.foreground}
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
        }
        footer={
          tracks.length > 0 ? (
            <WindowPlayButtons
              onPlay={() => playFromList(tracks, 0, name)}
              onShuffle={() => playShuffled(tracks, name)}
            />
          ) : undefined
        }
      />
    </View>
  );
}
