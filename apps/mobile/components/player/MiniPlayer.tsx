import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Music2, Pause, Play, SkipForward } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { colors } from '@/lib/theme';

function MiniPlayerInner() {
  const router = useRouter();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);

  if (!currentTrack) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
      <Pressable style={s.container} onPress={() => router.push('/player')}>
        {/* Progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={s.content}>
          {/* Art / placeholder */}
          <View style={s.art}>
            <Music2 size={18} color={colors.mutedForeground} />
          </View>

          {/* Track info */}
          <View style={s.info}>
            <Text style={s.title} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={s.artist} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
          </View>

          {/* Controls */}
          <Pressable onPress={togglePlay} hitSlop={12} style={s.controlBtn}>
            {isPlaying ? (
              <Pause size={22} color={colors.foreground} fill={colors.foreground} />
            ) : (
              <Play size={22} color={colors.foreground} fill={colors.foreground} />
            )}
          </Pressable>
          <Pressable onPress={next} hitSlop={12} style={s.controlBtn}>
            <SkipForward size={20} color={colors.foreground} fill={colors.foreground} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const MiniPlayer = memo(MiniPlayerInner);

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  art: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  artist: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  controlBtn: {
    padding: 6,
  },
});
