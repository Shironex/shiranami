import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/useAppStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { ArrowLeft, Play, Shuffle, Disc3 } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { motion } from 'motion/react';
import { TrackRowContent } from '@/components/shared/TrackRowContent';
import { BulkActionBar } from '@/components/shared/BulkActionBar';

export function AlbumDetailView() {
  const { t } = useTranslation('library');
  const selectedAlbumName = useAppStore(s => s.selectedAlbumName);
  const selectAlbum = useAppStore(s => s.selectAlbum);
  const library = usePlayerStore(s => s.library);
  const setQueue = usePlayerStore(s => s.setQueue);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

  const albumTracks = useMemo(() => {
    if (!selectedAlbumName) return [];
    return library.filter(t => (t.album || 'Unknown Album') === selectedAlbumName);
  }, [library, selectedAlbumName]);

  const albumArt = useMemo(
    () => albumTracks.find(t => t.albumArt)?.albumArt,
    [albumTracks]
  );

  const artist = useMemo(() => {
    const artists = new Set(albumTracks.map(t => t.artist));
    return Array.from(artists).join(', ');
  }, [albumTracks]);

  const totalDuration = useMemo(
    () => albumTracks.reduce((sum, t) => sum + t.duration, 0),
    [albumTracks]
  );

  const handleBack = useCallback(() => selectAlbum(null), [selectAlbum]);

  const handlePlayAll = useCallback(() => {
    if (albumTracks.length === 0) return;
    setQueue(albumTracks, 0);
  }, [albumTracks, setQueue]);

  const handleShuffle = useCallback(() => {
    if (albumTracks.length === 0) return;
    const shuffled = [...albumTracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQueue(shuffled, 0);
  }, [albumTracks, setQueue]);

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(albumTracks, index);
    },
    [albumTracks, setQueue]
  );

  if (!selectedAlbumName) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
        {/* Back + actions row */}
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t('backToAlbums')}
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>

          <div className="flex-1" />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handlePlayAll}
            disabled={albumTracks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {t('playAll')}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleShuffle}
            disabled={albumTracks.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            <Shuffle className="w-3.5 h-3.5" />
            {t('shuffle')}
          </motion.button>
        </div>

        {/* Album info */}
        <div className="flex items-center gap-4">
          <div className="shrink-0 w-20 h-20 rounded-xl bg-surface border border-border/30 flex items-center justify-center overflow-hidden">
            {albumArt ? (
              <img src={albumArt} alt={selectedAlbumName} className="w-full h-full object-cover" />
            ) : (
              <Disc3 className="w-8 h-8 text-muted-foreground/20" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-foreground truncate">
              {selectedAlbumName}
            </p>
            <p className="text-sm text-muted-foreground/60 truncate">{artist}</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {t('trackCount', { count: albumTracks.length })}
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 scrollbar-thin">
        {albumTracks.map((track, index) => (
          <div key={track.id} className="px-0.5">
            <TrackRowContent
              track={track}
              index={index}
              queue={albumTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              handlePlayTrack={handlePlayTrack}
              onToggleFavorite={toggleFavorite}
              showAddToPlaylist
            />
          </div>
        ))}
      </div>

      {hasSelection && <BulkActionBar trackList={albumTracks} />}
    </div>
  );
}
