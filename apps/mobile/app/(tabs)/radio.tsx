import { useCallback, useEffect } from 'react';
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
import { Heart, Radio, Search, X } from 'lucide-react-native';
import type { Station } from 'radio-browser-api';
import { useSQLiteContext } from 'expo-sqlite';
import { Text } from '@/components/ui/text';
import { useRadioStore, type RadioTab } from '@/stores/useRadioStore';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { colors } from '@/lib/theme';

const TABS: { key: RadioTab; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'search', label: 'Search' },
  { key: 'favorites', label: 'Favorites' },
];

export default function RadioScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const {
    stations,
    favoriteIds,
    isLoading,
    error,
    searchQuery,
    activeTab,
    currentStation,
    loadTopStations,
    searchStations,
    setSearchQuery,
    setActiveTab,
    setCurrentStation,
    toggleFavorite,
    setFavoriteIds,
  } = useRadioStore();

  const setQueue = usePlayerStore(s => s.setQueue);

  // Load favorites from DB and top stations on mount
  useEffect(() => {
    loadTopStations();
    db.getAllAsync<{ station_uuid: string }>('SELECT station_uuid FROM radio_favorites').then(
      rows => {
        setFavoriteIds(new Set(rows.map(r => r.station_uuid)));
      },
    );
  }, []);

  const playStation = useCallback(
    (station: Station) => {
      setCurrentStation(station);
      const track: Track = {
        id: `radio-${station.id}`,
        title: station.name,
        artist: station.country || 'Internet Radio',
        album: 'Radio',
        duration: 0,
        filePath: station.urlResolved || station.url,
        albumArt: station.favicon || undefined,
      };
      setQueue([track], 0);
    },
    [setCurrentStation, setQueue],
  );

  const handleToggleFavorite = useCallback(
    async (station: Station) => {
      const isFav = favoriteIds.has(station.id);
      toggleFavorite(station.id);
      if (isFav) {
        await db.runAsync('DELETE FROM radio_favorites WHERE station_uuid = ?', [station.id]);
      } else {
        await db.runAsync(
          `INSERT OR IGNORE INTO radio_favorites
           (id, station_uuid, name, url, url_resolved, homepage, favicon, country, country_code, language, codec, bitrate, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `rf-${station.id}`, station.id, station.name, station.url,
            station.urlResolved || station.url, station.homepage || null,
            station.favicon || null, station.country || null,
            station.countryCode || null, station.language?.join(',') || null,
            station.codec || null, station.bitrate || null,
            station.tags?.join(',') || null,
          ],
        );
      }
    },
    [favoriteIds, toggleFavorite, db],
  );

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      searchStations(searchQuery.trim());
    }
  }, [searchQuery, searchStations]);

  const renderStation = useCallback(
    ({ item }: { item: Station }) => {
      const isActive = currentStation?.id === item.id;
      const isFav = favoriteIds.has(item.id);

      return (
        <Pressable
          onPress={() => playStation(item)}
          style={({ pressed }) => [s.stationItem, pressed && s.pressed, isActive && s.active]}
        >
          <View style={s.stationIcon}>
            {item.favicon ? (
              <Image source={{ uri: item.favicon }} style={s.stationImg} />
            ) : (
              <Radio size={20} color={colors.mutedForeground} />
            )}
          </View>
          <View style={s.stationInfo}>
            <Text style={[s.stationName, isActive && s.stationNameActive]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={s.stationMeta} numberOfLines={1}>
              {[item.country, item.codec, item.bitrate ? `${item.bitrate}kbps` : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable onPress={() => handleToggleFavorite(item)} hitSlop={12} style={s.favBtn}>
            <Heart
              size={18}
              color={isFav ? colors.favorite : colors.mutedForeground}
              fill={isFav ? colors.favorite : 'transparent'}
            />
          </Pressable>
        </Pressable>
      );
    },
    [currentStation?.id, favoriteIds, playStation, handleToggleFavorite],
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <Text style={s.headerTitle}>Radio</Text>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(tab => (
          <Pressable
            key={tab.key}
            onPress={() => {
              setActiveTab(tab.key);
              if (tab.key === 'top') loadTopStations();
            }}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search bar (visible in search tab) */}
      {activeTab === 'search' && (
        <View style={s.searchBar}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            placeholder="Search stations..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            style={s.searchInput}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={stations}
          renderItem={renderStation}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primaryForeground,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    gap: 8,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.foreground,
    paddingVertical: 0,
  },
  list: {
    paddingBottom: 100,
  },
  stationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  active: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  stationIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stationImg: {
    width: '100%',
    height: '100%',
  },
  stationInfo: {
    flex: 1,
    gap: 2,
  },
  stationName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  stationNameActive: {
    color: colors.primary,
  },
  stationMeta: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  favBtn: {
    padding: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.destructive,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
