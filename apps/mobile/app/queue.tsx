import { useCallback } from 'react';
import { FlatList } from 'react-native';
import ListStart from 'lucide-react-native/icons/list-start';
import X from 'lucide-react-native/icons/x';
import { TrackRow } from '@/components/library/TrackRow';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

interface Row {
  track: Track;
  /** Position in the store's queue. */
  index: number;
}

/** The playing track and what comes after it. Tap to jump, or move and remove. */
export default function QueueSheet() {
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const source = usePlayerStore(s => s.queueSource);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playIndex = usePlayerStore(s => s.playIndex);
  const reorderQueue = usePlayerStore(s => s.reorderQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const clearUpNext = usePlayerStore(s => s.clearUpNext);

  const rows: Row[] = queue
    .map((track, index) => ({ track, index }))
    .slice(Math.max(queueIndex, 0));
  const upNext = rows.length - 1;

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      const current = item.index === queueIndex;
      return (
        <TrackRow
          track={item.track}
          active={current}
          playing={isPlaying}
          onPress={() => playIndex(item.index)}
          actions={
            current ? undefined : (
              <>
                {item.index > queueIndex + 1 && (
                  <IconButton
                    icon={ListStart}
                    size={20}
                    accessibilityLabel={`Play ${item.track.title} next`}
                    onPress={() => reorderQueue(item.index, queueIndex + 1)}
                  />
                )}
                <IconButton
                  icon={X}
                  size={20}
                  accessibilityLabel={`Remove ${item.track.title} from the queue`}
                  onPress={() => removeFromQueue(item.index)}
                />
              </>
            )
          }
        />
      );
    },
    [queueIndex, isPlaying, playIndex, reorderQueue, removeFromQueue]
  );

  return (
    <Sheet
      title="Up next"
      subtitle={`From ${source}`}
      fill
      action={
        upNext > 0 ? (
          <Button label="Clear" variant="text" size="compact" onPress={clearUpNext} />
        ) : null
      }
    >
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={item => `${item.track.id}-${item.index}`}
        contentContainerStyle={{ paddingHorizontal: 8 }}
        ListFooterComponent={
          upNext === 0 ? (
            <Text variant="bodyMuted" className="px-4 py-6 text-center">
              Nothing after this song.
            </Text>
          ) : null
        }
      />
    </Sheet>
  );
}
