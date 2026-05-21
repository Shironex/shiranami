import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { Sparkles, Play, Shuffle, ArrowLeft } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { motion } from 'motion/react';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { MIX_DEFINITIONS, type MixId } from './mixDefinitions';
import { useMixTracks } from '@/hooks/queries/useMixTracks';
import { useMixPreviews, getMixPreviewCount } from './mixUtils';
import { ArtCollage } from './ArtCollage';
import { MixesViewSkeleton } from './MixesViewSkeleton';

export function MixesView() {
  const { t } = useTranslation('mixes');
  // Merged so the mix previews / counts (`most-played`, `never-played`) reflect
  // play counts bumped this session via the overlay store.
  const library = useMergedLibrary();
  const libraryLoaded = useLibraryStore(s => s.libraryLoaded);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

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

  const selectedDef = selectedMix ? MIX_DEFINITIONS.find(m => m.id === selectedMix) : null;

  // ── Cold-start skeleton ──
  if (!libraryLoaded && library.length === 0) {
    return <MixesViewSkeleton />;
  }

  // ── Empty library state ──
  if (library.length === 0) {
    return <ViewEmptyState title={t('title')} subtitle={t('emptyLibrary')} icon={Sparkles} />;
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
          <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
            <div className="h-full px-2">
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
          </div>
        )}

        {hasSelection && <BulkActionBar trackList={mixTracks} />}
      </div>
    );
  }

  // ── Mix grid (overview) ──
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />

      <div className="flex-1 overflow-y-auto px-6 pt-3 pb-6 scrollbar-thin">
        <div className="rounded-2xl glass-panel border border-border/30 p-2 space-y-1.5">
          {MIX_DEFINITIONS.map(mix => {
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
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ))}
                    </div>
                  ) : previewTracks.length > 0 ? (
                    <img
                      src={previewTracks[0].albumArt}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
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
                  <p className="text-sm font-medium text-foreground truncate">{t(mix.titleKey)}</p>
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
                  <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
                    <Play className="w-3.5 h-3.5 text-primary fill-current" />
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

export default MixesView;
