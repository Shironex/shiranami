import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { ArtTile } from '@/components/art/ArtTile';
import { AlbumCard } from '@/components/library/AlbumCard';
import { FirstRun } from '@/components/library/FirstRun';
import { ScanProgress } from '@/components/library/ScanProgress';
import { TrackRow } from '@/components/library/TrackRow';
import { WindowPlayButtons } from '@/components/library/WindowPlayButtons';
import { useDockInset } from '@/components/nav/Dock';
import { Avatar } from '@/components/ui/avatar';
import { ChipRow } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import { useListAppear } from '@/hooks/useListAppear';
import {
  LIBRARY_FILTERS,
  SORT_LABELS,
  useLibraryView,
  type LibraryItem,
} from '@/hooks/useLibraryView';
import { countLabel } from '@/lib/format';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Gap between the two album covers in a grid row, and the row's side padding. */
const ALBUM_GAP = 12;
const ALBUM_ROW_PADDING = 12;

/** A group label: muted text for dates, a Sora letter for A to Z groups. */
function Label({ text, letter, end }: { text: string; letter?: boolean; end?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-3 pb-1.5 pt-[22px]">
      <Text
        variant="label"
        role="heading"
        className={cn(letter && 'font-display text-[16px] leading-[20px] text-soft-foreground')}
      >
        {text}
      </Text>
      {end}
    </View>
  );
}

function SortButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      className="h-7 flex-row items-center gap-1.5 rounded-full px-1 active:bg-border"
    >
      <ArrowUpDown size={18} color={colors.softForeground} />
      <Text variant="label" className="text-soft-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const bottomInset = useDockInset();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const view = useLibraryView();
  // The Favorites tile on Playlists opens here on the Favorites chip; `at` makes each tap count.
  const { filter: openOn, at } = useLocalSearchParams<{ filter?: string; at?: string }>();
  const { setFilter } = view;
  useEffect(() => {
    if (openOn === 'favorites') setFilter('favorites');
  }, [openOn, at, setFilter]);
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
  // List padding (4) and row padding on both sides, then the gap between two covers.
  const albumSize = Math.floor((width - 8 - ALBUM_ROW_PADDING * 2 - ALBUM_GAP) / 2);

  const renderItem = useCallback(
    ({ item }: { item: LibraryItem }) => {
      switch (item.type) {
        case 'label':
          return <Label text={item.text} letter={item.letter} />;
        case 'empty':
          return <EmptyState title={item.title} body={item.body} />;
        case 'albums':
          return (
            <View
              className="flex-row pb-4"
              style={{ gap: ALBUM_GAP, paddingHorizontal: ALBUM_ROW_PADDING }}
            >
              {item.albums.map(album => (
                <AlbumCard
                  key={album.key}
                  title={album.title}
                  meta={`${album.artist} · ${countLabel(album.tracks.length, 'song', 'songs')}`}
                  artUri={album.art}
                  size={albumSize}
                  onPress={() =>
                    router.push({
                      pathname: '/album/[title]',
                      params: { title: album.title, artist: album.artist },
                    })
                  }
                />
              ))}
            </View>
          );
        case 'artist':
          return (
            <ListRow
              art={<ArtTile title={item.name} />}
              title={item.name}
              meta={item.meta}
              end={<ChevronRight size={20} color={colors.mutedForeground} />}
              onPress={() =>
                router.push({ pathname: '/artist/[name]', params: { name: item.name } })
              }
            />
          );
        case 'track':
          return (
            <TrackRow
              swipeable
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
    [currentTrackId, isPlaying, playFromList, tracks, source, router, albumSize]
  );
  const renderRow = useListAppear(renderItem, view.items.length > 0);

  if (view.total === 0) return <FirstRun onImport={importFiles} importing={importing} />;

  const toggleSearch = () => {
    if (searching) view.setQuery('');
    setSearching(s => !s);
  };

  // The first group label sits in the header beside Sort, so Sort costs no row of its own.
  const sortable = view.filter === 'all' || view.filter === 'favorites';
  const [first, ...rest] = view.items;
  const lead = first?.type === 'label' ? first : null;
  const items = lead ? rest : view.items;
  const sort = sortable ? (
    <SortButton label={SORT_LABELS[view.sort]} onPress={view.cycleSort} />
  ) : null;
  // Play and Shuffle take the songs behind what is on screen, and stay off when that is empty.
  const { playable } = view;

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
      {lead ? (
        <View className="-mx-3">
          <Label text={lead.text} letter={lead.letter} end={sort} />
        </View>
      ) : sort ? (
        <View className="items-end pt-4">{sort}</View>
      ) : null}
      {view.filter === 'albums' && <View className="h-3.5" />}
    </View>
  );

  const subtitle = [
    countLabel(view.total, 'song', 'songs'),
    view.albumCount > 0 ? countLabel(view.albumCount, 'album', 'albums') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={items}
        renderItem={renderRow}
        keyExtractor={item => item.key}
        ListHeaderComponent={header}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingHorizontal: 4,
          paddingBottom: bottomInset,
        }}
      />
      <WindowHeader
        title="Library"
        subtitle={subtitle}
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
        footer={
          <WindowPlayButtons
            disabled={playable.length === 0}
            onPlay={() => playFromList(playable, 0, source)}
            onShuffle={() => playShuffled(playable, source)}
          />
        }
      />
    </View>
  );
}
