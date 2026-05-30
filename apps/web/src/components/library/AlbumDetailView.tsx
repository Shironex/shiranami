import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '@/stores/useViewStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { ArrowLeft, Play, Shuffle, Disc3 } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { motion } from 'motion/react';
import { TrackRowContent } from '@/components/shared/TrackRowContent';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { sortAlbumTracks, albumKeyOf } from '@/lib/albumSort';

function mostFrequent<T>(values: Array<T | null | undefined>): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let maxCount = 0;
  for (const v of values) {
    if (v == null || v === '') continue;
    const count = (counts.get(v as T) ?? 0) + 1;
    counts.set(v as T, count);
    if (count > maxCount) {
      maxCount = count;
      best = v as T;
    }
  }
  return best;
}

export function AlbumDetailView() {
  const { t } = useTranslation('library');
  const selectedAlbumKey = useViewStore(s => s.selectedAlbumKey);
  const selectAlbum = useViewStore(s => s.selectAlbum);
  const library = useLibraryStore(s => s.library);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

  const albumTracks = useMemo(() => {
    if (!selectedAlbumKey) return [];
    const filtered = library.filter(t => albumKeyOf(t) === selectedAlbumKey);
    return sortAlbumTracks(filtered);
  }, [library, selectedAlbumKey]);

  // Display title comes from the matched tracks (the key embeds the album
  // artist, not a human-readable title).
  const albumName = useMemo(() => albumTracks[0]?.album ?? '', [albumTracks]);

  // Multi-disc album detection: only render disc subheaders when the
  // sorted list actually spans more than one disc (after treating missing
  // values as disc 1). Single-disc albums keep the current compact layout.
  const discGroups = useMemo(() => {
    const groups: Array<{ disc: number; tracks: Track[] }> = [];
    for (const track of albumTracks) {
      const disc = track.discNumber ?? 1;
      const last = groups[groups.length - 1];
      if (last && last.disc === disc) {
        last.tracks.push(track);
      } else {
        groups.push({ disc, tracks: [track] });
      }
    }
    return groups;
  }, [albumTracks]);

  const hasMultipleDiscs = discGroups.length > 1;

  const albumArt = useMemo(() => albumTracks.find(t => t.albumArt)?.albumArt, [albumTracks]);

  const artist = useMemo(() => {
    const artists = new Set(albumTracks.map(t => t.artist));
    return Array.from(artists).join(', ');
  }, [albumTracks]);

  const year = useMemo(() => mostFrequent(albumTracks.map(t => t.year)), [albumTracks]);

  const genre = useMemo(() => mostFrequent(albumTracks.map(t => t.genre)), [albumTracks]);

  const headerMeta = useMemo(
    () => [artist, year?.toString(), genre].filter(Boolean).join(' · '),
    [artist, year, genre]
  );

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

  if (!selectedAlbumKey) return null;

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
          <TrackThumbnail
            albumArt={albumArt}
            alt={albumName}
            className="w-20 h-20 rounded-xl bg-surface border border-border/30"
            fallback={<Disc3 className="w-8 h-8 text-muted-foreground/20" />}
          />
          <div className="min-w-0 flex-1">
            <p className="font-serif italic text-2xl text-foreground truncate">
              {albumName}
            </p>
            <p className="text-sm text-muted-foreground/60 truncate">{headerMeta}</p>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {t('trackCount', { count: albumTracks.length })}
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass border border-border/30 overflow-hidden">
        <div className="h-full overflow-y-auto px-2 scrollbar-thin">
          {hasMultipleDiscs
            ? discGroups.map(group => {
                // Compute the base index of each disc's first track in the
                // flat albumTracks list so row indexing (and handlePlayTrack)
                // still matches the queue passed to TrackRowContent.
                const baseIndex = albumTracks.indexOf(group.tracks[0]);
                return (
                  <div key={`disc-${group.disc}`} className="mb-2">
                    <div className="flex items-center gap-2 px-1 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      <Disc3 className="w-3.5 h-3.5" />
                      <span>{t('discHeading', { n: group.disc })}</span>
                    </div>
                    {group.tracks.map((track, i) => (
                      <div key={track.id} className="px-0.5">
                        <TrackRowContent
                          track={track}
                          index={baseIndex + i}
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
                );
              })
            : albumTracks.map((track, index) => (
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
      </div>

      {hasSelection && <BulkActionBar trackList={albumTracks} />}
    </div>
  );
}
