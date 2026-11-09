import { memo, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import SkipForward from 'lucide-react-native/icons/skip-forward';
import X from 'lucide-react-native/icons/x';
import { ArtTile } from '@/components/art/ArtTile';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { dockPlayerMode } from '@/lib/dock';
import { registerMiniPlayer } from '@/lib/player-origin';
import type { Rect } from '@/lib/player-stage';
import { EASE_OUT_QUART, colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

const EASE = Easing.bezier(...EASE_OUT_QUART);

function measureRect(view: View | null): Promise<Rect | null> {
  return new Promise(resolve => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/** The progress line under the song; it doubles as the divider above the tabs. */
function Progress() {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  return (
    <View className="absolute bottom-0 left-4 right-4 h-0.5 overflow-hidden rounded-full bg-border">
      <View className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
    </View>
  );
}

/**
 * The top row of the dock: the playing song or station. Tap to open the
 * player. With nothing playing the row is gone and the dock is tabs only.
 */
function MiniPlayerInner() {
  const router = useRouter();
  const track = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const clearQueue = usePlayerStore(s => s.clearQueue);
  const rowRef = useRef<View>(null);
  const artRef = useRef<View>(null);

  // The player grows out of this row's artwork and shrinks back into it.
  useEffect(
    () =>
      registerMiniPlayer(async () => {
        const [art, row] = await Promise.all([
          measureRect(artRef.current),
          measureRect(rowRef.current),
        ]);
        return art && row ? { art, row } : null;
      }),
    []
  );

  const mode = dockPlayerMode(track);
  if (!track || mode === 'none') return null;
  const live = mode === 'live';

  return (
    <Animated.View
      entering={FadeIn.duration(200).easing(EASE)}
      exiting={FadeOut.duration(150).easing(EASE)}
    >
      <View ref={rowRef} collapsable={false} className="h-16 flex-row items-center pr-1.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open player, ${track.title}`}
          onPress={() => router.push('/player')}
          className="h-full min-w-0 flex-1 flex-row items-center gap-3 pl-2.5 active:opacity-70"
        >
          <View ref={artRef} collapsable={false}>
            <ArtTile title={track.title} artUri={track.albumArt} size={44} radius={12} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="rowTitle" numberOfLines={1} className="text-[15px]">
              {track.title}
            </Text>
            <Text variant="meta" numberOfLines={1} className="text-[13px]">
              {live ? 'Live radio' : track.artist}
            </Text>
          </View>
        </Pressable>
        <IconButton
          icon={isPlaying ? Pause : Play}
          filled
          color={colors.foreground}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={togglePlay}
        />
        {live ? (
          <IconButton
            icon={X}
            color={colors.foreground}
            accessibilityLabel="Stop radio"
            onPress={clearQueue}
          />
        ) : (
          <IconButton
            icon={SkipForward}
            color={colors.foreground}
            accessibilityLabel="Next"
            onPress={next}
          />
        )}
        {!live && <Progress />}
      </View>
    </Animated.View>
  );
}

export const MiniPlayer = memo(MiniPlayerInner);
