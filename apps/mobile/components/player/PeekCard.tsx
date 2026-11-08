import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { ArtTile } from '@/components/art/ArtTile';
import { LyricRow } from '@/components/player/LyricRow';
import { Text } from '@/components/ui/text';
import { useLyrics, type LyricLine } from '@/hooks/useLyrics';
import { upNextEntries, upNextSummary, type UpNextEntry } from '@/lib/up-next';
import { cn } from '@/lib/utils';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

type PeekTab = 'lyrics' | 'upNext';

const TABS: { value: PeekTab; label: string }[] = [
  { value: 'lyrics', label: 'Lyrics' },
  { value: 'upNext', label: 'Up next' },
];

function Segmented({ value, onChange }: { value: PeekTab; onChange: (tab: PeekTab) => void }) {
  return (
    <View role="tablist" className="flex-row rounded-full bg-border p-[3px]">
      {TABS.map(tab => {
        const on = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            role="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(tab.value)}
            hitSlop={{ top: 7, bottom: 7 }}
            className={cn('h-[30px] justify-center rounded-full px-3.5', on && 'bg-dock-tab')}
          >
            <Text
              variant="label"
              className={cn(
                'font-body-semibold text-[13.5px]',
                on ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A quiet line in the middle of the card when there is nothing to list. */
function Quiet({ children }: { children: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text variant="bodyMuted" className="text-center">
        {children}
      </Text>
    </View>
  );
}

function Lyrics({ track }: { track: Track }) {
  const currentTime = usePlayerStore(s => s.currentTime);
  const seek = usePlayerStore(s => s.seek);
  const listRef = useRef<FlatList<LyricLine>>(null);
  const { lyrics, loading, getActiveLine } = useLyrics(
    track.title,
    track.artist,
    track.album,
    track.duration
  );
  const active = getActiveLine(currentTime);

  useEffect(() => {
    if (active < 0 || !lyrics.synced) return;
    listRef.current?.scrollToIndex({ index: active, animated: true, viewPosition: 0.3 });
  }, [active, lyrics.synced]);

  if (lyrics.synced) {
    return (
      <FlatList
        ref={listRef}
        data={lyrics.synced}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <LyricRow
            size="card"
            text={item.text}
            state={index === active ? 'now' : index < active ? 'past' : 'next'}
            onPress={() => seek(item.time)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 10 }}
        onScrollToIndexFailed={() => {}}
      />
    );
  }
  if (lyrics.plain) {
    return (
      <FlatList
        data={lyrics.plain.split('\n')}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <LyricRow size="card" text={item || ' '} state="next" />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 10 }}
      />
    );
  }
  return <Quiet>{loading ? 'Looking for lyrics' : 'No lyrics for this song.'}</Quiet>;
}

const UpNextRow = memo(function UpNextRow({
  entry,
  onPress,
}: {
  entry: UpNextEntry;
  onPress: (index: number) => void;
}) {
  const { track } = entry;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title}`}
      onPress={() => onPress(entry.index)}
      className="min-h-[58px] flex-row items-center gap-3 rounded-lg px-1 active:bg-border"
    >
      <ArtTile title={track.title} artUri={track.albumArt} size={42} radius={10} />
      <View className="min-w-0 flex-1">
        <Text variant="rowTitle" numberOfLines={1} className="text-[15px]">
          {track.title}
        </Text>
        <Text variant="meta" numberOfLines={1} className="text-[13px]">
          {track.artist}
        </Text>
      </View>
    </Pressable>
  );
});

function UpNext({ entries }: { entries: UpNextEntry[] }) {
  const playIndex = usePlayerStore(s => s.playIndex);
  const onPress = useCallback((index: number) => playIndex(index), [playIndex]);
  if (entries.length === 0) return <Quiet>Nothing after this song.</Quiet>;
  return (
    <FlatList
      data={entries}
      keyExtractor={e => `${e.track.id}-${e.index}`}
      renderItem={({ item }) => <UpNextRow entry={item} onPress={onPress} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 6 }}
    />
  );
}

/**
 * The card under the cover on tall phones: synced lyrics that follow the song,
 * or the songs coming up. Lyrics come from LRCLIB when it has them.
 */
export function PeekCard({ track }: { track: Track }) {
  const [tab, setTab] = useState<PeekTab>('lyrics');
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);
  const entries = upNextEntries(queue, queueIndex);

  return (
    <View className="mx-4 flex-1 overflow-hidden rounded-[22px] border border-border bg-border px-[18px] pt-3.5">
      <View className="flex-row items-center justify-between">
        <Segmented value={tab} onChange={setTab} />
        {tab === 'upNext' && entries.length > 0 && (
          <Text variant="meta" className="font-body-semibold text-[13px]">
            {upNextSummary(entries)}
          </Text>
        )}
      </View>
      <View className="-mx-1 flex-1">
        {tab === 'lyrics' ? <Lyrics track={track} /> : <UpNext entries={entries} />}
      </View>
    </View>
  );
}
