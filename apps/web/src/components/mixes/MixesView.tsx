import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useHistoryQuery } from '@/hooks/queries/useHistory';
import {
  Sparkles,
  TrendingUp,
  Clock,
  Headphones,
  EyeOff,
  Play,
  Shuffle,
  ArrowLeft,
  Music,
} from 'lucide-react';
import { motion } from 'motion/react';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';

type MixId = 'most-played' | 'recently-added' | 'recently-played' | 'never-played';

interface MixDefinition {
  id: MixId;
  titleKey: string;
  descKey: string;
  emptyKey: string;
  icon: typeof TrendingUp;
}

const MIX_DEFINITIONS: MixDefinition[] = [
  {
    id: 'most-played',
    titleKey: 'mostPlayed',
    descKey: 'mostPlayedDesc',
    emptyKey: 'emptyMostPlayed',
    icon: TrendingUp,
  },
  {
    id: 'recently-added',
    titleKey: 'recentlyAdded',
    descKey: 'recentlyAddedDesc',
    emptyKey: 'emptyMix',
    icon: Clock,
  },
  {
    id: 'recently-played',
    titleKey: 'recentlyPlayed',
    descKey: 'recentlyPlayedDesc',
    emptyKey: 'emptyRecentlyPlayed',
    icon: Headphones,
  },
  {
    id: 'never-played',
    titleKey: 'neverPlayed',
    descKey: 'neverPlayedDesc',
    emptyKey: 'emptyMix',
    icon: EyeOff,
  },
];

const MIX_LIMIT = 50;

function useMixTracks(mixId: MixId | null): Track[] {
  const library = usePlayerStore((s) => s.library);
  const { data: historyData } = useHistoryQuery('all');

  return useMemo(() => {
    if (!mixId) return [];

    switch (mixId) {
      case 'most-played':
        return [...library]
          .filter((t) => (t.playCount ?? 0) > 0)
          .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
          .slice(0, MIX_LIMIT);

      case 'recently-added':
        return [...library]
          .filter((t) => t.createdAt)
          .sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return db - da;
          })
          .slice(0, MIX_LIMIT);

      case 'recently-played': {
        if (!historyData?.recent?.length) return [];
        const seen = new Set<string>();
        const trackIds: string[] = [];
        for (const entry of historyData.recent) {
          if (!seen.has(entry.trackId)) {
            seen.add(entry.trackId);
            trackIds.push(entry.trackId);
          }
        }
        const libraryMap = new Map(library.map((t) => [t.id, t]));
        return trackIds
          .map((id) => libraryMap.get(id))
          .filter((t): t is Track => t != null)
          .slice(0, MIX_LIMIT);
      }

      case 'never-played':
        return library
          .filter((t) => !t.playCount || t.playCount === 0)
          .slice(0, MIX_LIMIT);

      default:
        return [];
    }
  }, [mixId, library, historyData]);
}

/** Get preview tracks for the mix grid (album art thumbnails). */
function useMixPreviews(library: Track[]): Record<MixId, Track[]> {
  return useMemo(() => ({
    'most-played': [...library]
      .filter((t) => (t.playCount ?? 0) > 0 && t.albumArt)
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .slice(0, 4),
    'recently-added': [...library]
      .filter((t) => t.createdAt && t.albumArt)
      .sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      })
      .slice(0, 4),
    'recently-played': [],
    'never-played': library
      .filter((t) => (!t.playCount || t.playCount === 0) && t.albumArt)
      .slice(0, 4),
  }), [library]);
}

export function MixesView() {
  const { t } = useTranslation('mixes');
  const library = usePlayerStore((s) => s.library);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const toggleFavorite = usePlayerStore((s) => s.toggleFavorite);
  const hasSelection = useSelectionStore((s) => s.selectedTrackIds.size > 0);

  const [selectedMix, setSelectedMix] = useState<MixId | null>(null);
  const mixTracks = useMixTracks(selectedMix);
  const mixTracksRef = useRef(mixTracks);
  mixTracksRef.current = mixTracks;
  const previews = useMixPreviews(library);

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(mixTracksRef.current, index);
    },
    [setQueue]
  );

  const handlePlayAll = useCallback(() => {
    if (mixTracks.length === 0) return;
    setQueue(mixTracks, 0);
  }, [mixTracks, setQueue]);

  const handleShuffle = useCallback(() => {
    if (mixTracks.length === 0) return;
    const shuffled = [...mixTracks].sort(() => Math.random() - 0.5);
    setQueue(shuffled, 0);
  }, [mixTracks, setQueue]);

  const handleBack = useCallback(() => setSelectedMix(null), []);

  const selectedDef = selectedMix
    ? MIX_DEFINITIONS.find((m) => m.id === selectedMix)
    : null;

  // ── Empty library state ──
  if (library.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <Sparkles className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
        <div>
          <p className="font-display text-base font-medium text-muted-foreground">{t('title')}</p>
          <p className="text-sm text-muted-foreground/50 mt-1">{t('emptyLibrary')}</p>
        </div>
      </div>
    );
  }

  // ── Mix detail view ──
  if (selectedMix && selectedDef) {
    const Icon = selectedDef.icon;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleBack}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={t('back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>

            <div className="flex-1" />

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleShuffle}
              disabled={mixTracks.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            >
              <Shuffle className="w-3.5 h-3.5" />
              {t('shuffle')}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handlePlayAll}
              disabled={mixTracks.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {t('playAll')}
            </motion.button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold text-foreground">
                {t(selectedDef.titleKey)}
              </h2>
              <p className="text-xs text-muted-foreground/50 mt-0.5">
                {t('trackCount', { count: mixTracks.length })}
              </p>
            </div>
          </div>
        </div>

        {mixTracks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <Icon className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground/50">{t(selectedDef.emptyKey)}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 px-4">
            <List
              rowCount={mixTracks.length}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={TrackRow}
              rowProps={{
                queue: mixTracks,
                currentTrack,
                isPlaying,
                handlePlayTrack,
                onToggleFavorite: toggleFavorite,
                showAddToPlaylist: true,
              }}
            />
          </div>
        )}

        {hasSelection && <BulkActionBar trackList={mixTracks} />}
      </div>
    );
  }

  // ── Mix grid (overview) ──
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-2 pb-3 shrink-0">
        <h1 className="font-display text-lg font-semibold text-foreground">{t('title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">
        <div className="space-y-1.5">
          {MIX_DEFINITIONS.map((mix) => {
            const Icon = mix.icon;
            const preview = getMixPreviewCount(mix.id, library);
            const previewTracks = previews[mix.id];

            return (
              <motion.button
                key={mix.id}
                whileTap={{ scale: 0.99 }}
                onClick={() => setSelectedMix(mix.id)}
                className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-accent/40 transition-colors group text-left"
              >
                {/* Album art mosaic or icon fallback */}
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-accent/30">
                  {previewTracks.length >= 4 ? (
                    <div className="grid grid-cols-2 w-full h-full">
                      {previewTracks.slice(0, 4).map((track, i) => (
                        <img
                          key={i}
                          src={track.albumArt}
                          alt=""
                          aria-hidden="true"
                          className="w-full h-full object-cover"
                        />
                      ))}
                    </div>
                  ) : previewTracks.length > 0 ? (
                    <img
                      src={previewTracks[0].albumArt}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className="w-5 h-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {t(mix.titleKey)}
                  </p>
                  <p className="text-xs text-muted-foreground/40 truncate mt-0.5">
                    {t(mix.descKey)}
                  </p>
                </div>

                {/* Track count + play hint */}
                <div className="flex items-center gap-2 shrink-0">
                  {preview > 0 && (
                    <span className="text-[11px] text-muted-foreground/30 tabular-nums">
                      {t('trackCount', { count: preview })}
                    </span>
                  )}
                  <div className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
                    <Play className="w-3 h-3 text-primary fill-current" />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Subtle divider and track art collage */}
        <div className="mt-6 pt-5 border-t border-border/10">
          <ArtCollage library={library} />
        </div>
      </div>
    </div>
  );
}

/** A quiet decorative collage of album art from the library. */
function ArtCollage({ library }: { library: Track[] }) {
  const artTracks = useMemo(
    () => library.filter((t) => t.albumArt).slice(0, 12),
    [library]
  );

  if (artTracks.length < 4) return null;

  return (
    <div className="flex gap-1.5 overflow-hidden rounded-xl opacity-40">
      {artTracks.map((track, i) => (
        <div
          key={i}
          className="w-14 h-14 shrink-0 rounded-md overflow-hidden bg-accent/20"
        >
          {track.albumArt ? (
            <img src={track.albumArt} alt="" aria-hidden="true" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4 text-muted-foreground/20" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function getMixPreviewCount(mixId: MixId, library: Track[]): number {
  switch (mixId) {
    case 'most-played':
      return Math.min(MIX_LIMIT, library.filter((t) => (t.playCount ?? 0) > 0).length);
    case 'recently-added':
      return Math.min(MIX_LIMIT, library.length);
    case 'never-played':
      return Math.min(MIX_LIMIT, library.filter((t) => !t.playCount || t.playCount === 0).length);
    case 'recently-played':
      return 0;
    default:
      return 0;
  }
}

export default MixesView;
