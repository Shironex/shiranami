import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Library, Plus, SortAsc } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Text } from '@/components/ui/text';
import { TrackItem } from '@/components/library/TrackItem';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { colors } from '@/lib/theme';

type SortKey = 'title' | 'artist' | 'album' | 'created_at';

const SORT_LABELS: Record<SortKey, string> = {
  created_at: 'Recent',
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
};

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { importFiles, importing } = useLibraryActions();
  const [sortKey, setSortKey] = useState<SortKey>('created_at');

  const library = usePlayerStore(s => s.library);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const setQueue = usePlayerStore(s => s.setQueue);
  const setLibrary = usePlayerStore(s => s.setLibrary);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);

  // Load library from DB on mount
  useEffect(() => {
    db.getAllAsync<{
      id: string;
      file_path: string;
      title: string;
      artist: string;
      album: string;
      duration: number | null;
      album_art: string | null;
      is_favorite: number;
      play_count: number;
    }>('SELECT * FROM tracks ORDER BY created_at DESC').then(rows => {
      setLibrary(
        rows.map(r => ({
          id: r.id,
          filePath: r.file_path,
          title: r.title,
          artist: r.artist ?? 'Unknown Artist',
          album: r.album ?? 'Unknown Album',
          duration: r.duration ?? 0,
          albumArt: r.album_art ?? undefined,
          isFavorite: !!r.is_favorite,
          playCount: r.play_count ?? 0,
        }))
      );
    });
  }, [db, setLibrary]);

  const sorted = [...library].sort((a, b) => {
    switch (sortKey) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'artist':
        return a.artist.localeCompare(b.artist);
      case 'album':
        return a.album.localeCompare(b.album);
      default:
        return 0; // created_at is already default DB order
    }
  });

  const handlePlay = useCallback(
    (index: number) => {
      setQueue(sorted, index);
    },
    [sorted, setQueue]
  );

  const handleFavorite = useCallback(
    (trackId: string) => {
      toggleFavorite(trackId);
      db.runAsync(
        "UPDATE tracks SET is_favorite = NOT is_favorite, updated_at = datetime('now') WHERE id = ?",
        [trackId]
      );
    },
    [toggleFavorite, db]
  );

  const cycleSortKey = useCallback(() => {
    const keys: SortKey[] = ['created_at', 'title', 'artist', 'album'];
    setSortKey(prev => keys[(keys.indexOf(prev) + 1) % keys.length]);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackItem
        track={item}
        isActive={currentTrack?.id === item.id}
        onPress={() => handlePlay(index)}
        onFavoritePress={() => handleFavorite(item.id)}
      />
    ),
    [currentTrack?.id, handlePlay, handleFavorite]
  );

  const keyExtractor = useCallback((item: Track) => item.id, []);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Library</Text>
        <View style={s.headerActions}>
          <Pressable onPress={cycleSortKey} style={s.headerBtn} hitSlop={8}>
            <SortAsc size={18} color={colors.mutedForeground} />
            <Text style={s.sortLabel}>{SORT_LABELS[sortKey]}</Text>
          </Pressable>
        </View>
      </View>

      {/* Track count */}
      {library.length > 0 && (
        <Text style={s.trackCount}>
          {library.length} track{library.length !== 1 ? 's' : ''}
        </Text>
      )}

      {/* Track list or empty state */}
      {library.length === 0 ? (
        <View style={s.empty}>
          <Library size={48} color={colors.mutedForeground} />
          <Text style={s.emptyTitle}>No tracks yet</Text>
          <Text style={s.emptySubtitle}>Import music from your device to get started</Text>
          <Pressable onPress={importFiles} disabled={importing} style={s.importBtn}>
            <Plus size={18} color={colors.primaryForeground} />
            <Text style={s.importBtnText}>{importing ? 'Importing...' : 'Import Music'}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      {library.length > 0 && (
        <Pressable onPress={importFiles} disabled={importing} style={[s.fab, { bottom: 16 }]}>
          <Plus size={24} color={colors.primaryForeground} />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  sortLabel: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  trackCount: {
    fontSize: 13,
    color: colors.mutedForeground,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  listContent: {
    paddingBottom: 100,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primaryForeground,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
