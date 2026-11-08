import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { ArtTile } from '@/components/art/ArtTile';
import { FirstRun } from '@/components/library/FirstRun';
import { PlayShuffleRow } from '@/components/library/PlayShuffleRow';
import { ScanProgress } from '@/components/library/ScanProgress';
import { TrackRow } from '@/components/library/TrackRow';
import { Avatar } from '@/components/ui/avatar';
import { ChipRow } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { GroupLabel, ListRow } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import {
  LIBRARY_FILTERS,
  SORT_LABELS,
  useLibraryView,
  type LibraryItem,
} from '@/hooks/useLibraryView';
import { countLabel } from '@/lib/format';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

function SortButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      onPress={onPress}
      className="h-11 flex-row items-center gap-1.5 rounded-full px-2 active:bg-border"
    >
      <ArrowUpDown size={18} color={colors.softForeground} />
      <Text variant="label" className="text-soft-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const view = useLibraryView();
  const { importFiles, importing } = useLibraryActions();
  const scan = useLibraryScan();
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const [searching, setSearching] = useState(false);

  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playFromList = usePlayerStore(s => s.playFromList);
  const playShuffled = usePlayerStore(s => s.playShuffled);

  const { tracks, source } = view;
  const renderItem = useCallback(
    ({ item }: { item: LibraryItem }) => {
      switch (item.type) {
        case 'label':
          return <GroupLabel>{item.text}</GroupLabel>;
        case 'empty':
          return <EmptyState title={item.title} body={item.body} />;
        case 'artist':
          return (
            <ListRow
              art={<ArtTile title={item.name} />}
              title={item.name}
              meta={item.meta}
              end={<ChevronRight size={20} color={colors.mutedForeground} />}
              onPress={() => view.setArtist(item.name)}
            />
          );
        case 'track':
          return (
            <TrackRow
              track={item.track}
              active={item.track.id === currentTrackId}
              playing={isPlaying}
              onPress={() => playFromList(tracks, item.index, source)}
              onLongPress={() =>
                router.push({ pathname: '/track/[id]', params: { id: item.track.id } })
              }
            />
          );
      }
    },
    [currentTrackId, isPlaying, playFromList, tracks, source, router, view.setArtist]
  );

  if (view.total === 0) return <FirstRun onImport={importFiles} importing={importing} />;

  const toggleSearch = () => {
    if (searching) view.setQuery('');
    setSearching(s => !s);
  };

  const header = (
    <View className="px-3 pb-1">
      {scan.running && (
        <ScanProgress done={scan.done} total={scan.total} onCancel={scan.cancel} className="mt-2" />
      )}
      <ChipRow
        options={LIBRARY_FILTERS}
        value={view.filter}
        onChange={view.setFilter}
        className="mt-3"
      />
      {searching && (
        <SearchField
          value={view.query}
          onChangeText={view.setQuery}
          autoFocus
          placeholder={`Filter ${countLabel(view.total, 'song', 'songs')}`}
          accessibilityLabel="Filter songs"
          className="mt-3"
        />
      )}
      {view.artist ? (
        <View className="mt-3 flex-row items-center">
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel="All artists"
            onPress={() => view.setArtist(null)}
            className="-ml-2.5"
          />
          <Text variant="sheetTitle" numberOfLines={1} className="flex-1">
            {view.artist}
          </Text>
        </View>
      ) : null}
      {view.filter !== 'artists' || view.artist ? (
        <View className="mt-3">
          <PlayShuffleRow
            disabled={tracks.length === 0}
            onPlay={() => playFromList(tracks, 0, source)}
            onShuffle={() => playShuffled(tracks, source)}
            end={
              view.filter === 'history' ? null : (
                <SortButton label={SORT_LABELS[view.sort]} onPress={view.cycleSort} />
              )
            }
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={view.items}
        renderItem={renderItem}
        keyExtractor={item => item.key}
        ListHeaderComponent={header}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topInset, paddingHorizontal: 4, paddingBottom: 24 }}
      />
      <WindowHeader
        title="Library"
        subtitle={countLabel(view.total, 'song', 'songs')}
        scrollY={scrollY}
        actions={
          <>
            <IconButton
              icon={searching ? X : Search}
              color={colors.foreground}
              accessibilityLabel={searching ? 'Close filter' : 'Filter songs'}
              onPress={toggleSearch}
            />
            <Avatar />
          </>
        }
      />
    </View>
  );
}
