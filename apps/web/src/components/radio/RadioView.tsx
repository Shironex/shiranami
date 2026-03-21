import { useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useRadioStore, type RadioSearchTab } from '@/stores/useRadioStore';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Radio,
  Search,
  Heart,
  Play,
  Globe,
  Loader2,
  Star,
} from 'lucide-react';
import { motion } from 'motion/react';
import { List, type RowComponentProps } from 'react-window';
import type { Station } from 'radio-browser-api';

const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'GB', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'PL', name: 'Poland', flag: '\u{1F1F5}\u{1F1F1}' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'FR', name: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'ES', name: 'Spain', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'BR', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'KR', name: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'AU', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { code: 'CA', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
  { code: 'IT', name: 'Italy', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'NL', name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'RU', name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'IN', name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
];

function stationToTrack(station: Station): Track {
  const streamUrl = station.urlResolved || station.url;
  const tagsStr = Array.isArray(station.tags) ? station.tags.join(', ') : '';
  return {
    id: `radio:${station.id}`,
    title: station.name,
    artist: 'Live Radio',
    album: [station.country, station.codec, station.bitrate ? `${station.bitrate}kbps` : '']
      .filter(Boolean)
      .join(' \u00B7 '),
    duration: 0,
    filePath: `shiranami-radio://stream?url=${encodeURIComponent(streamUrl)}`,
    albumArt: station.favicon || undefined,
    genre: tagsStr.split(',')[0]?.trim() || null,
  };
}

function getCountryFlag(countryCode: string): string {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  return country?.flag ?? '';
}

interface StationRowProps {
  stations: Station[];
  currentTrackId: string | null;
  isPlaying: boolean;
  favorites: string[];
  onPlay: (index: number) => void;
  onToggleFavorite: (station: Station) => void;
}

function StationRow(props: RowComponentProps<StationRowProps>) {
  const {
    index,
    style,
    stations,
    currentTrackId,
    isPlaying,
    favorites,
    onPlay,
    onToggleFavorite,
  } = props as RowComponentProps<StationRowProps> & StationRowProps;
  const station = stations[index];

  if (!station) return null;

  const radioTrackId = `radio:${station.id}`;
  const isActive = currentTrackId === radioTrackId;
  const isFav = favorites.includes(station.id);
  const tagsStr = Array.isArray(station.tags) ? station.tags.slice(0, 2).join(', ') : '';
  const countryFlag = getCountryFlag(station.countryCode);

  return (
    <div style={style} className="px-0.5">
      <div
        className={cn(
          'w-full flex items-center gap-3 px-3 h-[52px] rounded-xl text-left transition-all duration-200 group',
          isActive
            ? 'bg-primary/[0.08] text-foreground'
            : 'hover:bg-accent text-foreground/80 hover:text-foreground'
        )}
      >
        {/* Station info + play */}
        <button
          onClick={() => onPlay(index)}
          className="flex items-center gap-3 min-w-0 flex-1"
        >
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden',
              isActive ? 'bg-primary/15' : 'bg-surface'
            )}
          >
            {station.favicon ? (
              <img
                src={station.favicon}
                alt=""
                className="w-full h-full object-cover rounded-lg"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <Radio
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground/40',
                station.favicon ? 'hidden' : ''
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium truncate text-left', isActive && 'text-primary')}>
              {station.name}
            </p>
            {tagsStr && (
              <p className="text-xs text-muted-foreground/50 truncate text-left">{tagsStr}</p>
            )}
          </div>
        </button>

        {/* Country + codec info */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {countryFlag && (
            <span className="text-xs" title={station.country}>
              {countryFlag}
            </span>
          )}
          {station.codec && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums font-medium px-1.5 py-0.5 rounded bg-muted/50">
              {station.codec}
              {station.bitrate > 0 ? ` ${station.bitrate}k` : ''}
            </span>
          )}
        </div>

        {/* Favorite button */}
        <motion.button
          whileTap={{ scale: 0.75 }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(station);
          }}
          className={cn(
            'shrink-0 p-1 rounded-md transition-colors duration-150',
            isFav
              ? 'text-red-400 hover:text-red-300'
              : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60'
          )}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('w-3.5 h-3.5 transition-all duration-150', isFav && 'fill-current')} />
        </motion.button>

        {/* Play/Pause indicator */}
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center">
          {isActive && isPlaying ? (
            <div className="flex items-end gap-[3px] h-4">
              <div
                className="w-[3px] h-full rounded-full bg-primary origin-bottom"
                style={{ animation: 'eq-bar-1 1.2s ease-in-out infinite' }}
              />
              <div
                className="w-[3px] h-full rounded-full bg-primary origin-bottom"
                style={{ animation: 'eq-bar-2 1.4s ease-in-out 0.2s infinite' }}
              />
              <div
                className="w-[3px] h-full rounded-full bg-primary origin-bottom"
                style={{ animation: 'eq-bar-3 1.1s ease-in-out 0.4s infinite' }}
              />
            </div>
          ) : (
            <Play className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>
    </div>
  );
}

const TAB_ITEMS: Array<{ id: RadioSearchTab; label: string; icon: typeof Radio }> = [
  { id: 'top', label: 'Top Stations', icon: Star },
  { id: 'country', label: 'By Country', icon: Globe },
  { id: 'favorites', label: 'Favorites', icon: Heart },
];

const RADIO_SKELETON_ROWS = 10;

function StationRowSkeleton() {
  return (
    <div className="px-0.5">
      <div className="flex h-[52px] items-center gap-3 rounded-xl px-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Skeleton className="h-3 w-5 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <Skeleton className="size-7 shrink-0 rounded-md" />
      </div>
    </div>
  );
}

export function RadioView() {
  const stations = useRadioStore((s) => s.stations);
  const favorites = useRadioStore((s) => s.favorites);
  const isLoading = useRadioStore((s) => s.isLoading);
  const error = useRadioStore((s) => s.error);
  const searchQuery = useRadioStore((s) => s.searchQuery);
  const selectedCountry = useRadioStore((s) => s.selectedCountry);
  const activeTab = useRadioStore((s) => s.activeTab);
  const searchStations = useRadioStore((s) => s.searchStations);
  const loadTopStations = useRadioStore((s) => s.loadTopStations);
  const loadByCountry = useRadioStore((s) => s.loadByCountry);
  const loadFavorites = useRadioStore((s) => s.loadFavorites);
  const toggleFavorite = useRadioStore((s) => s.toggleFavorite);
  const setSearchQuery = useRadioStore((s) => s.setSearchQuery);
  const setSelectedCountry = useRadioStore((s) => s.setSelectedCountry);
  const setActiveTab = useRadioStore((s) => s.setActiveTab);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const hasLoadedRef = useRef(false);

  // Load top stations on first mount
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadTopStations();
    }
  }, [loadTopStations]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim()) {
        debounceRef.current = setTimeout(() => {
          searchStations(value.trim());
        }, 500);
      } else {
        // If search cleared, reload based on active tab
        if (activeTab === 'top') loadTopStations();
        else if (activeTab === 'country') loadByCountry(selectedCountry);
        else if (activeTab === 'favorites') loadFavorites();
      }
    },
    [searchStations, activeTab, loadTopStations, loadByCountry, selectedCountry, loadFavorites, setSearchQuery]
  );

  const handleTabChange = useCallback(
    (tab: RadioSearchTab) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setActiveTab(tab);
      setSearchQuery('');
      if (tab === 'top') loadTopStations();
      else if (tab === 'country') loadByCountry(selectedCountry);
      else if (tab === 'favorites') loadFavorites();
    },
    [setActiveTab, setSearchQuery, loadTopStations, loadByCountry, selectedCountry, loadFavorites]
  );

  const handleCountryChange = useCallback(
    (countryCode: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSelectedCountry(countryCode);
      loadByCountry(countryCode);
    },
    [setSelectedCountry, loadByCountry]
  );

  const radioTracks = useMemo(() => stations.map(stationToTrack), [stations]);

  const handlePlayStation = useCallback(
    (index: number) => {
      setQueue(radioTracks, index);
    },
    [radioTracks, setQueue]
  );

  const currentTrackId = currentTrack?.id ?? null;
  const showEmptyState = !isLoading && stations.length === 0 && !error;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search bar */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search radio stations..."
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-card border border-border/50',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40',
              'transition-colors'
            )}
          />
          {isLoading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-3">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}

          {/* Country selector */}
          {activeTab === 'country' && (
            <div className="ml-2">
              <Select
                value={selectedCountry}
                onValueChange={handleCountryChange}
              >
                <SelectTrigger className="w-[172px]">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Station list */}
      {error ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md rounded-[28px] border border-border/20 bg-surface/20 px-8 py-10 text-center">
            <Radio className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => {
                if (activeTab === 'top') loadTopStations();
                else if (activeTab === 'country') loadByCountry(selectedCountry);
                else loadFavorites();
              }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 min-h-0 px-4">
          <div className="flex h-full flex-col gap-1 overflow-hidden">
            {Array.from({ length: RADIO_SKELETON_ROWS }, (_, index) => (
              <StationRowSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          {activeTab === 'favorites' ? (
            <>
              <Heart className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
              <div>
                <p className="font-display text-base font-medium text-muted-foreground">
                  No favorite stations yet
                </p>
                <p className="text-sm text-muted-foreground/50 mt-1">
                  Click the heart icon on any station to save it here
                </p>
              </div>
            </>
          ) : (
            <>
              <Radio className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
              <div>
                <p className="font-display text-base font-medium text-muted-foreground">
                  No stations found
                </p>
                <p className="text-sm text-muted-foreground/50 mt-1">
                  Try a different search or browse by country
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4">
          <List
            rowCount={stations.length}
            rowHeight={56}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={StationRow}
            rowProps={{
              stations,
              currentTrackId,
              isPlaying,
              favorites,
              onPlay: handlePlayStation,
              onToggleFavorite: toggleFavorite,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default RadioView;
