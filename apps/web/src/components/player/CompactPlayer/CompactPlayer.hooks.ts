import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@shiranami/shared';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import {
  useCompactStore,
  CMP_TITLE_CLASS,
  CMP_ARTIST_CLASS,
  CMP_ALBUM_CLASS,
} from '@/stores/useCompactStore';
import { useViewStore } from '@/stores/useViewStore';
import { isRadioTrack } from '@/lib/utils';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { useTempoBreathing } from '@/hooks/useTempoBreathing';
import { useWindowControls } from '@/hooks/useWindowControls';
import { useTrackTitle } from '@/hooks/useRadioNowPlaying';
import type { ICompactPlayerView } from './CompactPlayer.types';

export function useCompactPlayer(): ICompactPlayerView {
  const { t } = useTranslation('compact');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const duration = usePlaybackStore(s => s.duration);
  const setCompactMode = useCompactStore(s => s.setCompactMode);
  const compactAlwaysOnTop = useCompactStore(s => s.compactAlwaysOnTop);
  const toggleCompactAlwaysOnTop = useCompactStore(s => s.toggleCompactAlwaysOnTop);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);

  const compactFontSize = useCompactStore(s => s.compactFontSize);
  const compactAmbientIntensity = useCompactStore(s => s.compactAmbientIntensity);
  const compactShowAlbumArt = useCompactStore(s => s.compactShowAlbumArt);
  const compactShowAlbum = useCompactStore(s => s.compactShowAlbum);
  const compactShowSeek = useCompactStore(s => s.compactShowSeek);
  const compactShowVolume = useCompactStore(s => s.compactShowVolume);
  const compactShowFavorite = useCompactStore(s => s.compactShowFavorite);
  const compactShowLyrics = useCompactStore(s => s.compactShowLyrics);

  // Lyrics open-state lives in the store because opening it resizes the OS
  // window (the store owns compact window dimensions). Toggling it grows the
  // window and reveals the panel below the player; closing shrinks it back.
  const lyricsOpen = useCompactStore(s => s.compactLyricsExpanded);
  const setLyricsOpen = useCompactStore(s => s.setCompactLyricsExpanded);
  const lyricsButtonRef = useRef<HTMLButtonElement>(null);
  const lyricsPanelRef = useRef<HTMLDivElement>(null);

  const ambientColor = useAmbientColor();
  const tempoBreathing = useTempoBreathing();
  const { minimize: onMinimize } = useWindowControls();

  const onExitCompact = useCallback(() => {
    void setCompactMode(false);
  }, [setCompactMode]);

  const onToggleAlwaysOnTop = useCallback(() => {
    void toggleCompactAlwaysOnTop();
  }, [toggleCompactAlwaysOnTop]);

  const onToggleLyrics = useCallback(() => {
    setLyricsOpen(!lyricsOpen);
  }, [setLyricsOpen, lyricsOpen]);

  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const enterNowPlaying = useViewStore(s => s.enterNowPlaying);
  const onAlbumArtClick = useCallback(async () => {
    // Mirror the Spotify/Apple Music mini-player gesture: clicking the art
    // exits compact and surfaces the immersive Now Playing view if the user
    // has it enabled. Otherwise just exit compact and let the regular full
    // window come back into focus.
    await setCompactMode(false);
    if (nowPlayingViewEnabled && currentTrack) {
      enterNowPlaying();
    }
  }, [setCompactMode, nowPlayingViewEnabled, enterNowPlaying, currentTrack]);

  // Close the lyrics overlay when there is nothing to show it for, or when
  // the user disables the button setting while it happens to be open.
  useEffect(() => {
    if (lyricsOpen && (!currentTrack || !compactShowLyrics)) {
      setLyricsOpen(false);
    }
  }, [lyricsOpen, currentTrack, compactShowLyrics]);

  // Move focus into the lyrics panel on open and back to the trigger on close
  // so keyboard users stay anchored to the region they invoked. The ref guard
  // skips the close branch on the initial render (nothing was opened yet).
  const lyricsWasOpen = useRef(false);
  useEffect(() => {
    if (lyricsOpen) {
      lyricsWasOpen.current = true;
      lyricsPanelRef.current?.focus();
    } else if (lyricsWasOpen.current) {
      lyricsButtonRef.current?.focus();
    }
  }, [lyricsOpen]);

  const onLyricsKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setLyricsOpen(false);
      }
    },
    [setLyricsOpen]
  );

  // Radio only: the station's ICY `StreamTitle` when one has arrived, the
  // station name otherwise. `currentTrack.title` for everything else.
  const radioTitle = useTrackTitle(currentTrack);
  const showSeekBar = compactShowSeek && !!currentTrack && !isRadioTrack(currentTrack.filePath);
  const showAmbient = !lowPerformanceMode && compactAmbientIntensity > 0;
  const albumName = currentTrack?.album ?? '';
  const showAlbumLine = compactShowAlbum && albumName !== '';

  return {
    t,
    currentTrack,
    titleText: currentTrack ? radioTitle : t('nothingPlaying'),
    artistText: currentTrack ? currentTrack.artist : t('idleSubtitle'),
    durationLabel: formatDuration(duration),
    ambientColor,
    compactAmbientIntensity,
    showAmbient,
    lowPerformanceMode,
    breathing: tempoBreathing.active,
    compactShowAlbumArt,
    compactShowAlbum,
    showAlbumLine,
    albumName,
    compactShowVolume,
    compactShowFavorite,
    compactShowLyrics,
    showSeekBar,
    lyricsOpen,
    showLyricsPanel: lyricsOpen && !!currentTrack,
    compactAlwaysOnTop,
    titleClass: CMP_TITLE_CLASS[compactFontSize],
    artistClass: CMP_ARTIST_CLASS[compactFontSize],
    albumClass: CMP_ALBUM_CLASS[compactFontSize],
    lyricsButtonRef,
    lyricsPanelRef,
    onToggleLyrics,
    onToggleAlwaysOnTop,
    onExitCompact,
    onMinimize,
    onAlbumArtClick,
    onLyricsKeyDown,
  };
}
