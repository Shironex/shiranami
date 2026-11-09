import { useCallback, useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { runOnUI, scrollTo, useAnimatedRef } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { CardQuiet, CardRow } from '@/components/player/CardRow';
import { FadeScroll } from '@/components/player/FadeScroll';
import { Text } from '@/components/ui/text';
import { countLabel } from '@/lib/format';
import { PLAYER_CARD } from '@/lib/theme';
import { upNextEntries } from '@/lib/up-next';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

/** The card shows the start of the queue; the queue sheet has the rest. */
const UP_NEXT_ROWS = 50;

/**
 * The songs coming up, next one at the top. When the song changes the list
 * glides back to the top, so the next song is always the first row.
 */
export function CardUpNext() {
  const router = useRouter();
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const playIndex = usePlayerStore(s => s.playIndex);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const entries = upNextEntries(queue, queueIndex);
  const shown = entries.slice(0, UP_NEXT_ROWS);
  const more = entries.length - shown.length;

  useEffect(() => {
    runOnUI(() => {
      'worklet';
      scrollTo(scrollRef, 0, 0, true);
    })();
  }, [queueIndex, scrollRef]);

  // Rows only know their track; the slot is looked up at press time.
  const onPress = useCallback(
    (track: Track) => {
      const entry = upNextEntries(usePlayerStore.getState().queue, queueIndex).find(
        e => e.track === track
      );
      if (entry) playIndex(entry.index);
    },
    [playIndex, queueIndex]
  );

  if (entries.length === 0) return <CardQuiet>Nothing after this song.</CardQuiet>;
  return (
    <FadeScroll
      fadeColor={PLAYER_CARD}
      scrollRef={scrollRef}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
    >
      {shown.map(entry => (
        <CardRow key={`${entry.track.id}-${entry.index}`} track={entry.track} onPress={onPress} />
      ))}
      {more > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/queue')}
          className="h-12 justify-center rounded-lg px-1 active:bg-border"
        >
          <Text variant="label" className="text-[13.5px]">
            {`${countLabel(more, 'more song', 'more songs')} in the queue`}
          </Text>
        </Pressable>
      )}
    </FadeScroll>
  );
}
