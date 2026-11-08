import { useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Heart from 'lucide-react-native/icons/heart';
import Mic2 from 'lucide-react-native/icons/mic-vocal';
import Music2 from 'lucide-react-native/icons/eighth-note';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import Repeat from 'lucide-react-native/icons/repeat';
import Repeat1 from 'lucide-react-native/icons/repeat-1';
import Shuffle from 'lucide-react-native/icons/shuffle';
import SkipBack from 'lucide-react-native/icons/skip-back';
import SkipForward from 'lucide-react-native/icons/skip-forward';
import { LyricsPanel } from '@/components/player/LyricsPanel';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { colors } from '@/lib/theme';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const repeatMode = usePlayerStore(s => s.repeatMode);

  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const cycleRepeatMode = usePlayerStore(s => s.cycleRepeatMode);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const seek = usePlayerStore(s => s.seek);
  const [barWidth, setBarWidth] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);
  const playScale = useSharedValue(1);
  const playStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const handlePlayPress = () => {
    playScale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
    setTimeout(() => {
      playScale.value = withSpring(1, { damping: 8, stiffness: 200 });
    }, 100);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    togglePlay();
  };

  const isLive = currentTrack?.isLive ?? false;
  const canSeek = !isLive && duration > 0 && barWidth > 0;
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeekPress = (event: GestureResponderEvent) => {
    if (!canSeek) return;
    const ratio = Math.min(Math.max(event.nativeEvent.locationX / barWidth, 0), 1);
    seek(ratio * duration);
  };

  if (!currentTrack) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
        <View style={[s.container, { paddingTop: insets.top }]}>
          <Text style={s.emptyText}>No track playing</Text>
        </View>
      </>
    );
  }

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;
  const repeatActive = repeatMode !== 'off';

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronDown size={28} color={colors.foreground} />
          </Pressable>
          <Text style={s.topBarTitle}>Now Playing</Text>
          <Pressable onPress={() => setShowLyrics(v => !v)} hitSlop={12}>
            <Mic2 size={22} color={showLyrics ? colors.primary : colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Album art / Lyrics */}
        <View style={s.artSection}>
          {showLyrics ? (
            <LyricsPanel />
          ) : (
            <View style={s.artLarge}>
              <Music2 size={64} color={colors.mutedForeground} />
            </View>
          )}
        </View>

        {/* Track info */}
        <View style={s.trackInfo}>
          <View style={s.trackInfoRow}>
            <View style={s.trackInfoText}>
              <Text style={s.trackTitle} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              <Text style={s.trackArtist} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            </View>
            <Pressable onPress={() => toggleFavorite(currentTrack.id)} hitSlop={12}>
              <Heart
                size={22}
                color={currentTrack.isFavorite ? colors.favorite : colors.mutedForeground}
                fill={currentTrack.isFavorite ? colors.favorite : 'transparent'}
              />
            </Pressable>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressSection}>
          <Pressable
            onPress={handleSeekPress}
            onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
            disabled={!canSeek}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityRole="adjustable"
            accessibilityLabel={isLive ? 'Live stream' : 'Seek'}
          >
            <View style={s.progressTrack} pointerEvents="none">
              <View style={[s.progressFill, { width: isLive ? '100%' : `${progress * 100}%` }]} />
            </View>
          </Pressable>
          <View style={s.timeRow}>
            {isLive ? (
              <Text style={s.timeText}>Live</Text>
            ) : (
              <>
                <Text style={s.timeText}>{formatTime(currentTime)}</Text>
                <Text style={s.timeText}>{formatTime(duration)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Controls */}
        <View style={s.controls}>
          <Pressable onPress={toggleShuffle} hitSlop={12}>
            <Shuffle size={22} color={isShuffled ? colors.primary : colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={previous} hitSlop={12}>
            <SkipBack size={28} color={colors.foreground} fill={colors.foreground} />
          </Pressable>
          <Animated.View style={playStyle}>
            <Pressable onPress={handlePlayPress} style={s.playBtn}>
              {isPlaying ? (
                <Pause size={32} color={colors.primaryForeground} fill={colors.primaryForeground} />
              ) : (
                <Play size={32} color={colors.primaryForeground} fill={colors.primaryForeground} />
              )}
            </Pressable>
          </Animated.View>
          <Pressable onPress={next} hitSlop={12}>
            <SkipForward size={28} color={colors.foreground} fill={colors.foreground} />
          </Pressable>
          <Pressable onPress={cycleRepeatMode} hitSlop={12}>
            <RepeatIcon size={22} color={repeatActive ? colors.primary : colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  topBarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  artSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  artLarge: {
    width: '85%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  trackInfo: {
    paddingVertical: 12,
  },
  trackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trackInfoText: {
    flex: 1,
    gap: 4,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  trackArtist: {
    fontSize: 15,
    color: colors.mutedForeground,
  },
  progressSection: {
    paddingVertical: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
