import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Check from 'lucide-react-native/icons/check';
import Plus from 'lucide-react-native/icons/plus';
import { ArtTile } from '@/components/art/ArtTile';
import { ListRow } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { playlistMeta, usePlaylists } from '@/hooks/usePlaylists';
import { colors } from '@/lib/theme';
import { usePlaylistStore } from '@/stores/usePlaylistStore';

/** Picks a playlist for one song, or starts a new one with it. */
export default function AddToPlaylistSheet() {
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const entries = usePlaylists();

  const add = async (playlistId: string) => {
    await usePlaylistStore.getState().addTrack(db, playlistId, trackId);
    router.back();
  };

  return (
    <Sheet title="Add to playlist" scroll={entries.length > 5}>
      <View className="px-2">
        <ListRow
          art={
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary-tonal">
              <Plus size={22} color={colors.foreground} />
            </View>
          }
          title="New playlist"
          onPress={() => router.replace({ pathname: '/playlist-name', params: { trackId } })}
        />
        {entries.map(({ playlist, tracks }) => {
          const has = playlist.trackIds.includes(trackId);
          return (
            <ListRow
              key={playlist.id}
              art={<ArtTile title={playlist.name} />}
              title={playlist.name}
              meta={has ? 'Already here' : playlistMeta(tracks)}
              disabled={has}
              accessibilityState={{ disabled: has }}
              end={has ? <Check size={20} color={colors.primary} /> : null}
              onPress={() => add(playlist.id)}
            />
          );
        })}
      </View>
    </Sheet>
  );
}
