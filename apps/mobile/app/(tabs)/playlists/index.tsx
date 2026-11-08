import { useCallback } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Plus from 'lucide-react-native/icons/plus';
import { ArtTile } from '@/components/art/ArtTile';
import { useDockInset } from '@/components/nav/Dock';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow } from '@/components/ui/list-row';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { playlistMeta, usePlaylists } from '@/hooks/usePlaylists';
import { countLabel } from '@/lib/format';
import { colors } from '@/lib/theme';

type Entry = ReturnType<typeof usePlaylists>[number];

export default function PlaylistsScreen() {
  const bottomInset = useDockInset();
  const router = useRouter();
  const entries = usePlaylists();
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const create = useCallback(() => router.push('/playlist-name'), [router]);

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <ListRow
        art={<ArtTile title={item.playlist.name} />}
        title={item.playlist.name}
        meta={playlistMeta(item.tracks)}
        onPress={() =>
          router.push({ pathname: '/playlists/[id]', params: { id: item.playlist.id } })
        }
      />
    ),
    [router]
  );

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={entries}
        renderItem={renderItem}
        keyExtractor={item => item.playlist.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View className="h-3" />}
        ListEmptyComponent={
          <EmptyState title="No playlists yet" body="Make one, then long press any song to add it.">
            <Button label="New playlist" icon={Plus} onPress={create} />
          </EmptyState>
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
