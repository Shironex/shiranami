import { memo, useEffect, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLyrics, type LyricLine } from '@/hooks/useLyrics';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { colors } from '@/lib/theme';

function LyricsPanelInner() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);
  const listRef = useRef<FlatList<LyricLine>>(null);

  const { lyrics, loading, getActiveLine } = useLyrics(
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.duration
  );

  const activeLine = getActiveLine(currentTime);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLine >= 0 && listRef.current && lyrics.synced) {
      listRef.current.scrollToIndex({
        index: activeLine,
        animated: true,
        viewPosition: 0.4,
      });
    }
  }, [activeLine, lyrics.synced]);

  if (loading) {
    return (
      <View style={s.container}>
        <Text style={s.statusText}>Loading lyrics...</Text>
      </View>
    );
  }

  if (!lyrics.synced && !lyrics.plain) {
    return (
      <View style={s.container}>
        <Text style={s.statusText}>No lyrics available</Text>
      </View>
    );
  }

  // Plain lyrics fallback
  if (!lyrics.synced && lyrics.plain) {
    return (
      <View style={s.container}>
        <FlatList
          data={lyrics.plain.split('\n')}
          renderItem={({ item }) => <Text style={s.plainLine}>{item || ' '}</Text>}
          keyExtractor={(_, i) => String(i)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
        />
      </View>
    );
  }

  // Synced lyrics
  const renderLine = ({ item, index }: { item: LyricLine; index: number }) => {
    const isActive = index === activeLine;
    return <Text style={[s.syncedLine, isActive && s.activeLine]}>{item.text}</Text>;
  };

  return (
    <View style={s.container}>
      <FlatList
        ref={listRef}
        data={lyrics.synced!}
        renderItem={renderLine}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

export const LyricsPanel = memo(LyricsPanelInner);

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 4,
  },
  listContent: {
    paddingVertical: 16,
  },
  statusText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 24,
  },
  plainLine: {
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  syncedLine: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    lineHeight: 26,
  },
  activeLine: {
    color: colors.foreground,
    fontWeight: '700',
    fontSize: 20,
  },
});
