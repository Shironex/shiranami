import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useMixTracks } from '@/hooks/queries/useMixTracks';
import { useSmartMixes } from '@/hooks/queries/useSmartMixes';
import type { Track } from '@/stores/types';
import { shuffle } from '@/lib/shuffle';
import { MIX_DEFINITIONS, SMART_MIX_ICONS, type MixId } from '../mixDefinitions';
import { useMixPreviews, getMixPreviewCount } from '../mixUtils';
import type { IMixesViewView, IMixGridCard, ISmartMixCard } from './MixesView.types';

export function useMixesView(): IMixesViewView {
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

  // Mood/activity/decade mixes from the main process (time-of-day + weather +
  // library metadata). Clicking one resolves its track ids against the
  // in-memory library and plays them immediately. `null` means generation
  // failed (vs. `[]` = no mixes apply) — we surface that honestly below.
  const { data: smartMixes } = useSmartMixes();
  const smartMixesFailed = smartMixes === null;
  const smartMixList = useMemo(() => smartMixes ?? [], [smartMixes]);

  const handlePlaySmartMix = useCallback(
    (trackIds: string[]) => {
      const byId = new Map(library.map(track => [track.id, track]));
      const resolved = trackIds
        .map(id => byId.get(id))
        .filter((track): track is Track => Boolean(track));
      if (resolved.length === 0) return;
      setQueue(resolved, 0);
    },
    [library, setQueue]
  );

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(mixTracksRef.current, index);
    },
    [setQueue]
  );

  const onPlayAll = useCallback(() => {
    if (mixTracksRef.current.length === 0) return;
    setQueue(mixTracksRef.current, 0);
  }, [setQueue]);

  const onShuffle = useCallback(() => {
    if (mixTracksRef.current.length === 0) return;
    setQueue(shuffle(mixTracksRef.current), 0);
  }, [setQueue]);

  const onBack = useCallback(() => setSelectedMix(null), []);

  const selectedDef = useMemo(
    () => (selectedMix ? (MIX_DEFINITIONS.find(m => m.id === selectedMix) ?? null) : null),
    [selectedMix]
  );

  const smartMixCards = useMemo<readonly ISmartMixCard[]>(
    () =>
      smartMixList.map(mix => ({
        id: mix.id,
        icon: SMART_MIX_ICONS[mix.kind],
        title: mix.kind === 'decade' ? t('smart.decade', { decade: mix.decade }) : t(mix.titleKey),
        desc:
          mix.kind === 'decade' ? t('smart.decadeDesc', { decade: mix.decade }) : t(mix.descKey),
        count: mix.trackIds.length,
        onPlay: () => handlePlaySmartMix(mix.trackIds),
      })),
    [smartMixList, t, handlePlaySmartMix]
  );

  const mixGridCards = useMemo<readonly IMixGridCard[]>(
    () =>
      MIX_DEFINITIONS.map(mix => ({
        id: mix.id,
        icon: mix.icon,
        title: t(mix.titleKey),
        desc: t(mix.descKey),
        count: getMixPreviewCount(mix.id, library),
        previewTracks: previews[mix.id],
        onOpen: () => setSelectedMix(mix.id),
      })),
    [t, library, previews]
  );

  return {
    t,
    showSkeleton: !libraryLoaded && library.length === 0,
    isEmpty: library.length === 0,
    selectedDef,
    mixTracks,
    mixIsEmpty: mixTracks.length === 0,
    smartMixesFailed,
    smartMixCards,
    mixGridCards,
    hasSelection,
    library,
    rowProps: {
      queue: mixTracks,
      currentTrack,
      isPlaying,
      handlePlayTrack,
      onToggleFavorite: toggleFavorite,
      showAddToPlaylist: true,
    },
    onBack,
    onPlayAll,
    onShuffle,
  };
}
