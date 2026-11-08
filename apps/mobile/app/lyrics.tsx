import { memo, useEffect, useRef } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { ArtTile } from '@/components/art/ArtTile';
import { Scrim } from '@/components/art/Scrim';
import { PlayerBackdrop } from '@/components/player/PlayerBackdrop';
import { SeekBar } from '@/components/player/SeekBar';
import { Transport } from '@/components/player/Transport';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useLyrics, type LyricLine } from '@/hooks/useLyrics';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Lines fade out above the seek bar instead of being cut. */
const BOTTOM_FADE = [
  { at: 0, color: colors.background, opacity: 0 },
  { at: 1, color: colors.background, opacity: 1 },
] as const;

const Line = memo(function Line({
  text,
  state,
  onPress,
}: {
  text: string;
  state: 'past' | 'now' | 'next';
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityHint={onPress ? 'Plays from this line' : undefined}
      className="rounded-lg px-1 py-[11px] active:bg-border"
    >
      <Text
        className={cn(
          state === 'now'
            ? 'font-display text-[24px] leading-[31px] tracking-[-0.24px]'
            : 'font-display-medium text-[20px] leading-[28px] tracking-[-0.2px]'
        )}
        style={{ opacity: state === 'now' ? 1 : state === 'past' ? 0.45 : 0.6 }}
      >
        {text}
      </Text>
    </Pressable>
  );
});

/** Lyrics full screen: synced lines follow the song, tap a line to jump there. */
export default function LyricsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const track = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);
  const seek = usePlayerStore(s => s.seek);
  const listRef = useRef<FlatList<LyricLine>>(null);
  const { lyrics, loading, getActiveLine } = useLyrics(
    track?.title,
    track?.artist,
    track?.album,
    track?.duration
  );
  const active = getActiveLine(currentTime);

  useEffect(() => {
    if (active < 0 || !lyrics.synced) return;
    listRef.current?.scrollToIndex({ index: active, animated: true, viewPosition: 0.3 });
  }, [active, lyrics.synced]);

  if (!track) return <View className="flex-1 bg-background" />;

  const plain = !lyrics.synced && lyrics.plain ? lyrics.plain.split('\n') : null;

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
        {lyrics.synced ? (
          <FlatList
            ref={listRef}
            data={lyrics.synced}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => (
              <Line
                text={item.text}
                state={index === active ? 'now' : index < active ? 'past' : 'next'}
                onPress={() => seek(item.time)}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 40 }}
            onScrollToIndexFailed={() => {}}
          />
        ) : plain ? (
          <FlatList
            data={plain}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => <Line text={item || ' '} state="next" />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 40 }}
          />
        ) : (
          <View className="flex-1 justify-center">
            <EmptyState
              title={loading ? 'Looking for lyrics' : 'No lyrics for this song'}
              body={loading ? '' : 'Lyrics come from LRCLIB when they are there.'}
            />
          </View>
        )}
        <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 h-14">
          <Scrim stops={BOTTOM_FADE} />
        </View>
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
