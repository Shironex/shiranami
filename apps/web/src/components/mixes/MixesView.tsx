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
  color: string;
}

const MIX_DEFINITIONS: MixDefinition[] = [
  {
    id: 'most-played',
    titleKey: 'mostPlayed',
    descKey: 'mostPlayedDesc',
    emptyKey: 'emptyMostPlayed',
    icon: TrendingUp,
    color: 'from-orange-500/20 to-rose-500/10',
  },
  {
    id: 'recently-added',
    titleKey: 'recentlyAdded',
    descKey: 'recentlyAddedDesc',
    emptyKey: 'emptyMix',
    icon: Clock,
    color: 'from-blue-500/20 to-cyan-500/10',
  },
  {
    id: 'recently-played',
    titleKey: 'recentlyPlayed',
    descKey: 'recentlyPlayedDesc',
    emptyKey: 'emptyRecentlyPlayed',
    icon: Headphones,
    color: 'from-violet-500/20 to-purple-500/10',
  },
  {
    id: 'never-played',
    titleKey: 'neverPlayed',
    descKey: 'neverPlayedDesc',
    emptyKey: 'emptyMix',
    icon: EyeOff,
    color: 'from-emerald-500/20 to-teal-500/10',
  },
];

const MIX_LIMIT = 50;

function useMixTracks(mixId: MixId | null): Track[] {
  const library = usePlayerStore((s) => s.library);

  // Fetch recent history for the "recently-played" mix
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
        // Deduplicate by trackId, keeping most recent play
        const seen = new Set<string>();
        const trackIds: string[] = [];
        for (const entry of historyData.recent) {
          if (!seen.has(entry.trackId)) {
            seen.add(entry.trackId);
            trackIds.push(entry.trackId);
          }
        }
        // Map to library tracks (preserves order)
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
        {/* Header */}
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

          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedDef.color} flex items-center justify-center shrink-0`}>
              <Icon className="w-6 h-6 text-foreground/60" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-foreground">
                {t(selectedDef.titleKey)}
              </h2>
              <p className="text-xs text-muted-foreground/50 mt-0.5">
                {t('trackCount', { count: mixTracks.length })}
              </p>
            </div>
          </div>
        </div>

        {/* Track list */}
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
      <div className="px-6 pt-2 pb-4 shrink-0">
        <h1 className="font-display text-lg font-semibold text-foreground">{t('title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">
        <div className="grid grid-cols-2 gap-3">
          {MIX_DEFINITIONS.map((mix) => {
            const Icon = mix.icon;
            const preview = getMixPreviewCount(mix.id, library);

            return (
              <motion.button
                key={mix.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedMix(mix.id)}
                className="text-left p-4 rounded-2xl border border-border/30 hover:border-border/50 hover:bg-accent/30 transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${mix.color} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground group-hover:text-foreground">
                  {t(mix.titleKey)}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-0.5">
                  {t(mix.descKey)}
                </p>
                {preview > 0 && (
                  <p className="text-[10px] text-muted-foreground/40 mt-2">
                    {t('trackCount', { count: preview })}
                  </p>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Quick preview count for the mix grid (no heavy computation). */
function getMixPreviewCount(mixId: MixId, library: Track[]): number {
  switch (mixId) {
    case 'most-played':
      return Math.min(MIX_LIMIT, library.filter((t) => (t.playCount ?? 0) > 0).length);
    case 'recently-added':
      return Math.min(MIX_LIMIT, library.length);
    case 'never-played':
      return Math.min(MIX_LIMIT, library.filter((t) => !t.playCount || t.playCount === 0).length);
    case 'recently-played':
      return 0; // Requires async data, skip preview
    default:
      return 0;
  }
}

export default MixesView;
