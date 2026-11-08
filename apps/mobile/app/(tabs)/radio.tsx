import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSQLiteContext } from 'expo-sqlite';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { useDockInset } from '@/components/nav/Dock';
import { RadioNotice } from '@/components/radio/RadioNotice';
import { StationPresets } from '@/components/radio/StationPresets';
import { StationRow } from '@/components/radio/StationRow';
import { Avatar } from '@/components/ui/avatar';
import { ChipRow } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { GroupLabel } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { RADIO_CHIPS, useRadioView, type RadioItem } from '@/hooks/useRadioView';
import { dockPlayerMode } from '@/lib/dock';
import { stationTrack, type RadioStation } from '@/lib/radio';
import { radioNotice, radioSubtitle } from '@/lib/radio-view';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useRadioStore } from '@/stores/useRadioStore';

export default function RadioScreen() {
  const bottomInset = useDockInset();
  const topInset = useWindowInset();
  const { scrollY, onScroll } = useWindowScroll();
  const db = useSQLiteContext();
  const { items, favoriteIds, presets, favorites, error, refresh } = useRadioView();
  const filter = useRadioStore(s => s.filter);
  const query = useRadioStore(s => s.query);
  const currentStationId = useRadioStore(s => s.currentStationId);
  const setFilter = useRadioStore(s => s.setFilter);
  const setQuery = useRadioStore(s => s.setQuery);
  const toggleFavorite = useRadioStore(s => s.toggleFavorite);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playerError = usePlayerStore(s => s.error);
  const playFromList = usePlayerStore(s => s.playFromList);
  const [searching, setSearching] = useState(false);

  const currentTrackId = currentTrack?.id;
  const stationName =
    currentTrack && dockPlayerMode(currentTrack) === 'live' ? currentTrack.title : null;

  const play = useCallback(
    (station: RadioStation) => {
      useRadioStore.getState().setCurrentStation(station.id);
      playFromList([stationTrack(station)], 0, 'Radio');
    },
    [playFromList]
  );

  const renderItem = useCallback(
    ({ item }: { item: RadioItem }) => {
      switch (item.type) {
        case 'label':
          return <GroupLabel>{item.text}</GroupLabel>;
        case 'loading':
          return <ActivityIndicator color={colors.primary} className="py-8" />;
        case 'empty':
          return <EmptyState title={item.title} body={item.body} />;
        case 'station':
          return (
            <StationRow
              station={item.station}
              active={currentTrackId === stationTrack(item.station).id}
              playing={isPlaying}
              saved={favoriteIds.has(item.station.id)}
              onPress={() => play(item.station)}
              onToggleSaved={() => toggleFavorite(db, item.station)}
            />
          );
      }
    },
    [currentTrackId, isPlaying, favoriteIds, play, toggleFavorite, db]
  );

  const toggleSearch = () => {
    if (searching) setQuery('');
    setSearching(s => !s);
  };

  const notice = radioNotice(stationName, playerError, error);
  const retry = () => {
    if (notice?.retry === 'station') {
      const { favorites: saved, stations } = useRadioStore.getState();
      const station = [...saved, ...stations].find(f => f.id === currentStationId);
      if (station) play(station);
      else usePlayerStore.getState().togglePlay();
    } else {
      refresh();
    }
  };
  const showPresets = presets.length > 0 && filter !== 'favorites';

  const header = (
    <View className="px-3 pb-1">
      {searching && (
        <SearchField
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Search stations"
          accessibilityLabel="Search stations"
          className="mt-3"
        />
      )}
      {showPresets && (
        <>
          <GroupLabel className="px-0.5">Saved</GroupLabel>
          <StationPresets
            stations={presets}
            activeId={stationName ? currentStationId : null}
            onPlay={play}
          />
        </>
      )}
      {notice && (
        <View className="mt-4">
          <RadioNotice text={notice.text} onRetry={retry} />
        </View>
      )}
      <ChipRow
        options={RADIO_CHIPS}
        value={query ? null : filter}
        onChange={next => {
          setQuery('');
          setSearching(false);
          setFilter(next);
        }}
        className={showPresets || notice ? 'mt-5' : 'mt-3'}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Animated.FlatList
        data={items}
        renderItem={renderItem}
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
        title="Radio"
        subtitle={radioSubtitle(isPlaying ? stationName : null, favorites.length)}
        scrollY={scrollY}
        photo="sunset"
        actions={
          <>
            <IconButton
              icon={searching ? X : Search}
              color={colors.foreground}
              accessibilityLabel={searching ? 'Close search' : 'Search stations'}
              onPress={toggleSearch}
            />
            <Avatar />
          </>
        }
      />
    </View>
  );
}
