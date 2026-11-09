import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import { CardQuiet } from '@/components/player/CardRow';
import { CardSimilar } from '@/components/player/CardSimilar';
import { CardTabs, type CardTab } from '@/components/player/CardTabs';
import { CardUpNext } from '@/components/player/CardUpNext';
import { LyricsView } from '@/components/player/LyricsView';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import type { LyricsResult } from '@/hooks/useLyrics';
import { MOTION, motion } from '@/lib/motion';
import { PLAYER_CARD, colors } from '@/lib/theme';
import { upNextEntries, upNextSummary } from '@/lib/up-next';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import type { PlayerCardTab } from '@/stores/usePlayerViewStore';

const TABS: readonly CardTab<PlayerCardTab>[] = [
  { value: 'lyrics', label: 'Lyrics' },
  { value: 'upNext', label: 'Up next' },
  { value: 'similar', label: 'Similar' },
];

/** Panes slide this far as they cross, toward the side of their tab. */
const PANE_SHIFT = 18;

function Pane({
  index,
  position,
  active,
  children,
}: {
  index: number;
  position: SharedValue<number>;
  active: boolean;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const distance = index - position.value;
    return {
      opacity: Math.max(0, 1 - Math.abs(distance) * 1.4),
      transform: [{ translateX: distance * PANE_SHIFT }],
    };
  });
  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, style]}
    >
      {children}
    </Animated.View>
  );
}

function UpNextSummary() {
  const router = useRouter();
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const entries = upNextEntries(queue, queueIndex);
  if (entries.length === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the queue"
      onPress={() => router.push('/queue')}
      hitSlop={8}
      className="ml-2 min-w-0 shrink rounded-full px-2 py-1 active:bg-border"
    >
      <Text variant="meta" numberOfLines={1} className="font-body-semibold text-[13px]">
        {upNextSummary(entries)}
      </Text>
    </Pressable>
  );
}

interface PlayerCardProps {
  track: Track;
  lyrics: LyricsResult;
  loading: boolean;
  tab: PlayerCardTab;
  onTab: (tab: PlayerCardTab) => void;
}

/**
 * The card under the cover: lyrics that follow the song, the songs coming
 * up, or songs like this one from the library. Each pane scrolls inside the
 * card; switching tabs crossfades them.
 */
export function PlayerCard({ track, lyrics, loading, tab, onTab }: PlayerCardProps) {
  const router = useRouter();
  const tabIndex = TABS.findIndex(t => t.value === tab);
  const position = useSharedValue(tabIndex);
  // A pane mounts the first time it is shown and then stays, so switching back is instant.
  const [visited, setVisited] = useState<Set<PlayerCardTab>>(() => new Set([tab]));

  useEffect(() => {
    position.value = withTiming(tabIndex, motion(MOTION.base));
    setVisited(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab, tabIndex, position]);

  const openLyrics = () => router.push('/lyrics');
  const hasLyrics = !!(lyrics.synced || lyrics.plain);

  return (
    <View
      className="flex-1 overflow-hidden rounded-[22px] border border-border pt-3.5"
      style={{ backgroundColor: PLAYER_CARD }}
    >
      <View className="h-9 flex-row items-center justify-between pl-[18px] pr-2">
        <CardTabs tabs={TABS} value={tab} onPress={onTab} />
        {tab === 'lyrics' && hasLyrics && (
          <IconButton
            icon={Maximize2}
            size={18}
            color={colors.mutedForeground}
            accessibilityLabel="Lyrics full screen"
            onPress={openLyrics}
          />
        )}
        {tab === 'upNext' && <UpNextSummary />}
      </View>
      <View className="flex-1">
        {TABS.map((t, index) =>
          visited.has(t.value) ? (
            <Pane key={t.value} index={index} position={position} active={t.value === tab}>
              <View className="flex-1 px-[14px]">
                {t.value === 'lyrics' ? (
                  <LyricsView
                    key={track.id}
                    lyrics={lyrics}
                    size="card"
                    fadeColor={PLAYER_CARD}
                    paddingHorizontal={0}
                    paddingVertical={14}
                    onBackgroundPress={openLyrics}
                    empty={
                      <CardQuiet>
                        {loading ? 'Looking for lyrics' : 'No lyrics for this song.'}
                      </CardQuiet>
                    }
                  />
                ) : t.value === 'upNext' ? (
                  <CardUpNext />
                ) : (
                  <CardSimilar track={track} />
                )}
              </View>
            </Pane>
          ) : null
        )}
      </View>
    </View>
  );
}
