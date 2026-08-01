import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useYouTubeSearch } from '@/hooks/useYouTubeSearch';
import { useYouTubeStream } from '@/hooks/useYouTubeStream';
import { colors } from '@/lib/theme';
import type { SearchResult } from '@/lib/types';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatViewCount(count?: number): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K views`;
  return `${count} views`;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { query, setQuery, results, suggestions, loading, error, search, clear } =
    useYouTubeSearch();
  const { streamResult, streaming } = useYouTubeStream();

  const renderResult = useCallback(
    ({ item }: { item: SearchResult }) => {
      const isStreaming = streaming === item.id;

      return (
        <Pressable
          onPress={() => streamResult(item)}
          disabled={isStreaming}
          style={({ pressed }) => [s.resultItem, pressed && s.pressed]}
        >
          {/* Thumbnail */}
          <View style={s.thumbnail}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={s.thumbnailImg} />
            ) : (
              <View style={s.thumbnailPlaceholder} />
            )}
            <View style={s.durationBadge}>
              <Text style={s.durationText}>{formatDuration(item.duration)}</Text>
            </View>
            {isStreaming && (
              <View style={s.streamingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>

          {/* Info */}
          <View style={s.resultInfo}>
            <Text style={s.resultTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={s.resultMeta} numberOfLines={1}>
              {item.uploader}
              {item.viewCount ? ` · ${formatViewCount(item.viewCount)}` : ''}
            </Text>
          </View>
        </Pressable>
      );
    },
    [streamResult, streaming]
  );

  const renderSuggestion = useCallback(
    ({ item }: { item: string }) => (
      <Pressable
        onPress={() => search(item)}
        style={({ pressed }) => [s.suggestion, pressed && s.pressed]}
      >
        <Search size={14} color={colors.mutedForeground} />
        <Text style={s.suggestionText} numberOfLines={1}>
          {item}
        </Text>
      </Pressable>
    ),
    [search]
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Search bar */}
      <View style={s.searchBar}>
        <Search size={18} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => search()}
          placeholder="Search YouTube..."
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          style={s.searchInput}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={clear} hitSlop={8}>
            <X size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* Suggestions */}
      {suggestions.length > 0 && results.length === 0 && (
        <FlatList
          data={suggestions}
          renderItem={renderSuggestion}
          keyExtractor={item => item}
          keyboardShouldPersistTaps="handled"
          style={s.suggestions}
        />
      )}

      {/* Loading */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={s.centered}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => search()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Results */}
      {!loading && !error && results.length > 0 && (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={item => item.id}
          contentContainerStyle={s.resultsList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Empty state */}
      {!loading && !error && results.length === 0 && query.length === 0 && (
        <View style={s.centered}>
          <Search size={48} color={colors.mutedForeground} />
          <Text style={s.emptyText}>Search for music on YouTube</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    gap: 8,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.foreground,
    paddingVertical: 0,
  },
  suggestions: {
    maxHeight: 200,
    marginHorizontal: 16,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  resultsList: {
    paddingBottom: 100,
  },
  resultItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  thumbnail: {
    width: 120,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.muted,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    fontSize: 11,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  streamingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    lineHeight: 18,
  },
  resultMeta: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: colors.mutedForeground,
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.destructive,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  retryText: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: '500',
  },
});
