import { useCallback } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { ScreenTitle } from '@/components/nav/ScreenTitle';
import { StationRow } from '@/components/radio/StationRow';
import { Avatar } from '@/components/ui/avatar';
import { ChipRow } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { GroupLabel } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { RADIO_CHIPS, useRadioView, type RadioItem } from '@/hooks/useRadioView';
import { stationTrack, type RadioStation } from '@/lib/radio';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useRadioStore } from '@/stores/useRadioStore';

export default function RadioScreen() {
  const db = useSQLiteContext();
  const { items, favoriteIds } = useRadioView();
  const filter = useRadioStore(s => s.filter);
  const query = useRadioStore(s => s.query);
  const setFilter = useRadioStore(s => s.setFilter);
  const setQuery = useRadioStore(s => s.setQuery);
  const toggleFavorite = useRadioStore(s => s.toggleFavorite);
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playFromList = usePlayerStore(s => s.playFromList);

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

  return (
    <View className="flex-1 bg-background">
      <ScreenTitle title="Radio" actions={<Avatar />} />
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={item => item.key}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="px-3 pt-3">
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search stations"
              accessibilityLabel="Search stations"
            />
            <ChipRow
              options={RADIO_CHIPS}
              value={query ? null : filter}
              onChange={next => {
                setQuery('');
                setFilter(next);
              }}
              className="mt-3.5"
            />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 24 }}
      />
    </View>
  );
}
