import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useRadioStore, type RadioSearchTab } from '@/stores/useRadioStore';
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
  Globe,
  Loader2,
  Star,
} from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { List } from 'react-window';
import { COUNTRIES, stationToTrack } from './radioUtils';
import { StationRow } from './StationRow';
import { StationRowSkeleton, RADIO_SKELETON_ROWS } from './StationRowSkeleton';

const TAB_IDS: Array<{ id: RadioSearchTab; labelKey: string; icon: typeof Radio }> = [
  { id: 'top', labelKey: 'topStations', icon: Star },
  { id: 'country', labelKey: 'byCountry', icon: Globe },
  { id: 'favorites', labelKey: 'favorites', icon: Heart },
];

export function RadioView() {
  const { t } = useTranslation('radio');
  const { t: tCommon } = useTranslation('common');
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

  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setQueue = usePlaybackStore((s) => s.setQueue);

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

  const radioTracks = useMemo(
    () => stations.map((s) => stationToTrack(s, tCommon('liveRadio'))),
    [stations, tCommon]
  );

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
            placeholder={t('searchPlaceholder')}
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
          {TAB_IDS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(tab.labelKey)}
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
                  <SelectValue placeholder={t('selectCountry')} />
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
          <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center">
            <div className="relative">
              <div className="w-28 h-28 rounded-[28px] bg-destructive/8 border border-destructive/10 flex items-center justify-center">
                <img
                  src="./mascot.png"
                  alt=""
                  aria-hidden="true"
                  className="w-[4.5rem] h-[4.5rem] object-contain opacity-50"
                  draggable={false}
                />
              </div>
              <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
                <Radio className="w-4 h-4 text-destructive" />
              </div>
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground/85">
                {error}
              </p>
            </div>
            <button
              onClick={() => {
                if (activeTab === 'top') loadTopStations();
                else if (activeTab === 'country') loadByCountry(selectedCountry);
                else loadFavorites();
              }}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('retry', { ns: 'common' })}
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
        activeTab === 'favorites' ? (
          <ViewEmptyState
            title={t('noFavoriteStationsTitle')}
            subtitle={t('noFavoriteStationsSubtitle')}
            icon={Heart}
          />
        ) : (
          <ViewEmptyState
            title={t('noStationsTitle')}
            subtitle={t('noStationsSubtitle')}
            icon={Radio}
          />
        )
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
