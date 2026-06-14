import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@shiranami/shared';
import { useViewStore } from '@/stores/useViewStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { Track } from '@/stores/types';
import { sortAlbumTracks, albumKeyOf } from '@/lib/albumSort';
import type { IAlbumDiscBlock, IAlbumDetailViewView } from './AlbumDetailView.types';

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

export function useAlbumDetailView(): IAlbumDetailViewView {
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

  // Flatten the disc groups into render-ready blocks: each row carries its flat
  // index into `albumTracks` so the shell renders without computing in JSX.
  const discBlocks = useMemo<IAlbumDiscBlock[]>(() => {
    if (!hasMultipleDiscs) {
      return [
        {
          key: 'disc-single',
          heading: null,
          rows: albumTracks.map((track, index) => ({ id: track.id, track, index })),
        },
      ];
    }
    return discGroups.map(group => {
      const baseIndex = albumTracks.indexOf(group.tracks[0]);
      return {
        key: `disc-${group.disc}`,
        heading: t('discHeading', { n: group.disc }),
        rows: group.tracks.map((track, i) => ({ id: track.id, track, index: baseIndex + i })),
      };
    });
  }, [hasMultipleDiscs, discGroups, albumTracks, t]);

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

  const onBack = useCallback(() => selectAlbum(null), [selectAlbum]);

  const onPlayAll = useCallback(() => {
    if (albumTracks.length === 0) return;
    setQueue(albumTracks, 0);
  }, [albumTracks, setQueue]);

  const onShuffle = useCallback(() => {
    if (albumTracks.length === 0) return;
    const shuffled = [...albumTracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQueue(shuffled, 0);
  }, [albumTracks, setQueue]);

  const onPlayTrack = useCallback(
    (index: number) => {
      setQueue(albumTracks, index);
    },
    [albumTracks, setQueue]
  );

  return {
    t,
    hasAlbum: Boolean(selectedAlbumKey),
    albumTracks,
    discBlocks,
    albumName,
    albumArt,
    headerMeta,
    trackCountLabel: t('trackCount', { count: albumTracks.length }),
    totalDuration,
    durationSuffix: totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : '',
    hasSelection,
    actionsDisabled: albumTracks.length === 0,
    currentTrack,
    isPlaying,
    onToggleFavorite: toggleFavorite,
    onPlayTrack,
    onBack,
    onPlayAll,
    onShuffle,
  };
}
