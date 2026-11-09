import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Search from 'lucide-react-native/icons/search';
import { useDockInset } from '@/components/nav/Dock';
import { ResultRow } from '@/components/search/ResultRow';
import { SearchNotice } from '@/components/search/SearchNotice';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { useYouTubeSave } from '@/hooks/useYouTubeSave';
import { useYouTubeSearch } from '@/hooks/useYouTubeSearch';
import { useYouTubeStream } from '@/hooks/useYouTubeStream';
import { colors } from '@/lib/theme';
import type { SearchResult } from '@/lib/types';
import { youtubeTrackId } from '@/lib/youtube-save';
import { usePlayerStore } from '@/stores/usePlayerStore';

type Item =
  | { type: 'suggestion'; key: string; text: string }
  | { type: 'result'; key: string; result: SearchResult };

export default function SearchScreen() {
  const bottomInset = useDockInset();
  const topInset = useWindowInset();
  const { scrollY, onScroll } = useWindowScroll();
  const { query, setQuery, searched, results, suggestions, loading, error, search, retry, clear } =
    useYouTubeSearch();
  const { streamResult, streaming, failed } = useYouTubeStream();
  const { jobs, savedIds, save, cancel } = useYouTubeSave();
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);

  const showSuggestions = suggestions.length > 0 && !loading;
  const items = useMemo<Item[]>(
    () =>
      showSuggestions
        ? suggestions.map(text => ({ type: 'suggestion', key: `s:${text}`, text }))
        : results.map(result => ({ type: 'result', key: result.id, result })),
    [showSuggestions, suggestions, results]
  );

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      if (item.type === 'suggestion') {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Search for ${item.text}`}
            onPress={() => search(item.text)}
            className="min-h-12 flex-row items-center gap-3.5 rounded-lg px-3 active:bg-border"
          >
            <Search size={18} color={colors.mutedForeground} />
            <Text variant="option" numberOfLines={1} className="flex-1">
              {item.text}
            </Text>
          </Pressable>
        );
      }
      const { result } = item;
      return (
        <ResultRow
          result={result}
          active={currentTrackId === youtubeTrackId(result.id)}
          playing={isPlaying}
          loading={streaming === result.id}
          saved={savedIds.has(result.id)}
          job={jobs[result.id]}
          playError={failed?.id === result.id ? failed.message : null}
          onPress={() => streamResult(result)}
          onSave={() => save(result)}
          onCancel={() => cancel(result.id)}
        />
      );
    },
    [
      currentTrackId,
      isPlaying,
      streaming,
      savedIds,
      jobs,
      failed,
      search,
      streamResult,
      save,
      cancel,
    ]
  );

  const header = (
    <View className="px-3 pb-2">
      <SearchField
        value={query}
        onChangeText={text => (text ? setQuery(text) : clear())}
        onSubmitEditing={() => search()}
        placeholder="Search YouTube"
        accessibilityLabel="Search YouTube"
        className="mt-3"
      />
      {error && (
        <View className="mt-4">
          <SearchNotice text={error} onRetry={retry} />
        </View>
      )}
      {loading && <ActivityIndicator color={colors.primary} className="py-8" />}
    </View>
  );

  let empty = null;
  if (loading || error) {
    empty = null;
  } else if (!query) {
    empty = (
      <EmptyState
        title="Find a song on YouTube"
        body="Play it right away, or save it to this phone to listen offline."
      />
    );
  } else if (searched === query && results.length === 0) {
    empty = <EmptyState title="No songs found" body="Try other words, or fewer of them." />;
  }

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={item => item.key}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingHorizontal: 4,
          paddingBottom: bottomInset,
        }}
      />
      <WindowHeader title="Search" scrollY={scrollY} photo="summer" actions={<Avatar />} />
    </View>
  );
}
