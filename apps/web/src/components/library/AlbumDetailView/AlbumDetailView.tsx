import { ArrowLeft, Play, Shuffle, Disc3 } from 'lucide-react';
import { motion } from 'motion/react';
import { TrackRowContent } from '@/components/shared/TrackRowContent';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { useAlbumDetailView } from './AlbumDetailView.hooks';

export default function AlbumDetailView() {
  const {
    t,
    hasAlbum,
    albumTracks,
    discBlocks,
    albumName,
    albumArt,
    headerMeta,
    trackCountLabel,
    durationSuffix,
    hasSelection,
    actionsDisabled,
    currentTrack,
    isPlaying,
    onToggleFavorite,
    onPlayTrack,
    onBack,
    onPlayAll,
    onShuffle,
  } = useAlbumDetailView();

  // Build the disc/track JSX above the return — `.map` here is not in JSX
  // render position, so the declarative-JSX rule stays satisfied.
  const discElements = discBlocks.map(block => {
    const rows = block.rows.map(row => (
      <div key={row.id} className="px-0.5">
        <TrackRowContent
          track={row.track}
          index={row.index}
          queue={albumTracks}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          handlePlayTrack={onPlayTrack}
          onToggleFavorite={onToggleFavorite}
          showAddToPlaylist
        />
      </div>
    ));
    return (
      <div key={block.key} className={block.heading ? 'mb-2' : undefined}>
        {block.heading && (
          <div className="flex items-center gap-2 px-1 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            <Disc3 className="w-3.5 h-3.5" />
            <span>{block.heading}</span>
          </div>
        )}
        {rows}
      </div>
    );
  });

  if (!hasAlbum) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
        {/* Back + actions row */}
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t('backToAlbums')}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>

          <div className="flex-1" />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onPlayAll}
            disabled={actionsDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {t('playAll')}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onShuffle}
            disabled={actionsDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            <Shuffle className="w-3.5 h-3.5" />
            {t('shuffle')}
          </motion.button>
        </div>

        {/* Album info */}
        <div className="flex items-center gap-4">
          <TrackThumbnail
            albumArt={albumArt}
            alt={albumName}
            className="w-20 h-20 rounded-xl bg-surface border border-border/30"
            fallback={<Disc3 className="w-8 h-8 text-muted-foreground/20" />}
          />
          <div className="min-w-0 flex-1">
            <p className="font-serif italic text-2xl text-foreground truncate">{albumName}</p>
            <p className="text-sm text-muted-foreground/60 truncate">{headerMeta}</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {trackCountLabel}
              {durationSuffix}
            </p>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass border border-border/30 overflow-hidden">
        <div className="h-full overflow-y-auto px-2 scrollbar-thin">{discElements}</div>
      </div>

      {hasSelection && <BulkActionBar trackList={albumTracks} />}
    </div>
  );
}
