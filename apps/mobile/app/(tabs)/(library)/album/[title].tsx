import { useCallback, useMemo } from 'react';
import { FlatList, Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Play from 'lucide-react-native/icons/play';
import Shuffle from 'lucide-react-native/icons/shuffle';
import { ArtTile } from '@/components/art/ArtTile';
import { Scrim } from '@/components/art/Scrim';
import { NumberedRow } from '@/components/library/NumberedRow';
import { useDockInset } from '@/components/nav/Dock';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { albumMeta, findAlbum } from '@/lib/albums';
import { colors } from '@/lib/theme';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

const BACKDROP_HEIGHT = 300;
const COVER = 132;
const FADE = [
  { at: 0, color: colors.background, opacity: 0.35 },
  { at: 0.92, color: colors.background, opacity: 1 },
] as const;

/** An album: cover beside the title on a blurred wash of the same cover, then its songs. */
export default function AlbumScreen() {
  const { title, artist } = useLocalSearchParams<{ title: string; artist: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = useDockInset();
  const library = usePlayerStore(s => s.library);
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playFromList = usePlayerStore(s => s.playFromList);
  const playShuffled = usePlayerStore(s => s.playShuffled);
  const album = useMemo(() => findAlbum(library, title, artist), [library, title, artist]);
  const tracks = useMemo(() => album?.tracks ?? [], [album]);

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <NumberedRow
        track={item}
        number={item.trackNumber ?? index + 1}
        active={item.id === currentTrackId}
        playing={isPlaying}
        onPress={() => playFromList(tracks, index, title)}
        onLongPress={() => router.push({ pathname: '/track/[id]', params: { id: item.id } })}
      />
    ),
    [currentTrackId, isPlaying, playFromList, tracks, title, router]
  );

  const back = (
    <IconButton
      icon={ArrowLeft}
      color={colors.foreground}
      accessibilityLabel="Back"
      onPress={() => router.back()}
    />
  );

  if (!album) {
    return (
      <View className="flex-1 bg-background px-2" style={{ paddingTop: insets.top + 4 }}>
        {back}
        <EmptyState title="This album is gone" body="Its songs left the library." />
      </View>
    );
  }

  const header = (
    <View className="px-4">
      <View className="-mx-2 h-[52px] flex-row items-center">{back}</View>
      <View className="mt-1.5 flex-row items-end gap-[18px]">
        <View style={{ boxShadow: '0 24px 40px -18px rgba(0,0,4,0.95)', borderRadius: 18 }}>
          <ArtTile title={album.title} artUri={album.art} size={COVER} radius={18} />
        </View>
        <View className="min-w-0 flex-1 pb-1">
          <Text variant="title" numberOfLines={3} className="leading-[28px]">
            {album.title}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Artist, ${album.artist}`}
            onPress={() =>
              router.push({ pathname: '/artist/[name]', params: { name: album.artist } })
            }
            hitSlop={8}
            className="mt-1.5 self-start"
          >
            <Text variant="rowTitle" numberOfLines={1} className="text-[15px] text-primary">
              {album.artist}
            </Text>
          </Pressable>
          <Text variant="meta" numberOfLines={1} className="mt-1">
            {albumMeta(album)}
          </Text>
        </View>
      </View>
      <View className="mb-2.5 mt-[18px] flex-row items-center gap-2">
        <Button
          label="Play"
          icon={Play}
          iconFilled
          size="compact"
          onPress={() => playFromList(tracks, 0, album.title)}
        />
        <Button
          label="Shuffle"
          icon={Shuffle}
          variant="tonal"
          size="compact"
          onPress={() => playShuffled(tracks, album.title)}
        />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 overflow-hidden"
        style={{ height: BACKDROP_HEIGHT + insets.top }}
      >
        {album.art && (
          <Image
            source={{ uri: album.art }}
            blurRadius={28}
            accessibilityIgnoresInvertColors
            style={{ width: '100%', height: '100%', opacity: 0.55, transform: [{ scale: 1.3 }] }}
          />
        )}
        <Scrim stops={FADE} />
      </View>
      <FlatList
        data={tracks}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingHorizontal: 4,
          paddingBottom: bottomInset,
        }}
      />
    </View>
  );
}
