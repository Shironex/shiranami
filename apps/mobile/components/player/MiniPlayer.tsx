import { memo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import SkipForward from 'lucide-react-native/icons/skip-forward';
import X from 'lucide-react-native/icons/x';
import { ArtTile } from '@/components/art/ArtTile';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

function Progress() {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  return (
    <View className="absolute bottom-0 left-3 right-3 h-0.5 bg-border">
      <View className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
    </View>
  );
}

/** The playing track above the navigation bar. Tap to open the player. */
function MiniPlayerInner() {
  const router = useRouter();
  const track = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const clearQueue = usePlayerStore(s => s.clearQueue);

  if (!track) return null;
  const live = track.isLive ?? false;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <View
        className="mx-2 mb-2 h-16 flex-row items-center overflow-hidden rounded-xl bg-mini pr-1.5"
        style={{ boxShadow: '0 -12px 28px -10px rgba(0,0,4,0.8)' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open player, ${track.title}`}
          onPress={() => router.push('/player')}
          className="h-full min-w-0 flex-1 flex-row items-center gap-3 pl-2"
        >
          <ArtTile title={track.title} artUri={track.albumArt} size={44} />
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
