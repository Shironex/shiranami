import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { ArtTile } from '@/components/art/ArtTile';
import { LyricsView } from '@/components/player/LyricsView';
import { PlayerBackdrop } from '@/components/player/PlayerBackdrop';
import { SeekBar } from '@/components/player/SeekBar';
import { Transport } from '@/components/player/Transport';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useLyrics } from '@/hooks/useLyrics';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Lyrics full screen: synced lines follow the song, tap a line to jump there. */
export default function LyricsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const track = usePlayerStore(s => s.currentTrack);
  const { lyrics, loading } = useLyrics(track?.title, track?.artist, track?.album, track?.duration);
  if (!track) return <View className="flex-1 bg-background" />;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <PlayerBackdrop />
      <View className="flex-row items-center gap-3 pl-2 pr-5">
        <IconButton
          icon={ChevronDown}
          size={24}
          color={colors.foreground}
          accessibilityLabel="Close lyrics"
          onPress={() => router.back()}
        />
        <ArtTile title={track.title} artUri={track.albumArt} size={44} radius={10} />
        <View className="min-w-0 flex-1">
          <Text variant="rowTitle" numberOfLines={1} className="text-[15px]">
            {track.title}
          </Text>
          <Text variant="meta" numberOfLines={1} className="text-[13px] text-soft-foreground">
            {track.artist}
          </Text>
        </View>
      </View>

      <View className="flex-1">
        <LyricsView
          key={track.id}
          lyrics={lyrics}
          size="full"
          fadeColor={colors.background}
          fadeTop={0}
          fadeBottom={56}
          paddingHorizontal={28}
          paddingVertical={40}
          empty={
            <View className="flex-1 justify-center">
              <EmptyState
                title={loading ? 'Looking for lyrics' : 'No lyrics for this song'}
                body={loading ? '' : 'Lyrics come from LRCLIB when they are there.'}
              />
            </View>
          }
        />
      </View>

      <View className="px-7 pt-2">
        <SeekBar />
        <View className="-mx-1.5 pt-1.5">
          <Transport playSize={64} />
        </View>
      </View>
    </View>
  );
}
