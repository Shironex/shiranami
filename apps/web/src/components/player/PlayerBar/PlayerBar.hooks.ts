import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@shiranami/shared';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTrack } from '@/hooks/useTrack';
import { useUIStore } from '@/stores/useUIStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useViewStore } from '@/stores/useViewStore';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { useFavoriteCelebration } from '@/hooks/useFavoriteCelebration';
import { useTrackTitle } from '@/hooks/useRadioNowPlaying';
import { isRadioTrack } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import type { IPlayerBarView } from './PlayerBar.types';

const MOD = IS_MAC ? '⌘' : 'Ctrl';

export function usePlayerBar(): IPlayerBarView {
  const { t } = useTranslation('player');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  // Heart state reads through the overlay so a toggle from any surface
  // reflects on the player bar without re-allocating `library`.
  const mergedTrack = useTrack(currentTrack?.id, currentTrack);
  const isFavorite = mergedTrack?.isFavorite ?? currentTrack?.isFavorite ?? false;
  const duration = usePlaybackStore(s => s.duration);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const ambientColor = useAmbientColor();
  const rightPanel = useViewStore(s => s.rightPanel);
  const toggleRightPanel = useViewStore(s => s.toggleRightPanel);
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const toggleVisualizer = useUIStore(s => s.toggleVisualizer);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setCompactMode = useCompactStore(s => s.setCompactMode);
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const enterNowPlaying = useViewStore(s => s.enterNowPlaying);
  const titleText = useTrackTitle(currentTrack);

  // Element visibility (Settings · Interface · Player bar). Core playback
  // controls and the seek bar are not toggleable.
  const showAlbumArt = useInterfaceStore(s => s.playerAlbumArt);
  const showFavorite = useInterfaceStore(s => s.playerFavorite);
  const showTimeLabels = useInterfaceStore(s => s.playerTimeLabels);
  const showSleepTimer = useInterfaceStore(s => s.playerSleepTimer);
  const showEqualizer = useInterfaceStore(s => s.playerEqualizer);
  const showCompactButton = useInterfaceStore(s => s.playerCompactButton);
  const showVisualizerButton = useInterfaceStore(s => s.playerVisualizerButton);
  const showLyricsButton = useInterfaceStore(s => s.playerLyricsButton);
  const showQueueButton = useInterfaceStore(s => s.playerQueueButton);
  const showVolume = useInterfaceStore(s => s.playerVolume);
  const showWaveformSeekbar = useInterfaceStore(s => s.playerWaveformSeekbar);

  const hasUtilityButtons =
    showSleepTimer || showEqualizer || showCompactButton || showVisualizerButton;
  const hasButtonCluster = hasUtilityButtons || showLyricsButton || showQueueButton;

  const isRadio = Boolean(currentTrack && isRadioTrack(currentTrack.filePath));
  const showSeekRow = !isRadio;
  const showFavoriteButton = showFavorite && !isRadio;

  const onToggleFavorite = useCallback(() => {
    if (currentTrack) toggleFavorite(currentTrack.id);
  }, [currentTrack, toggleFavorite]);

  const onEnterCompact = useCallback(() => {
    void setCompactMode(true);
  }, [setCompactMode]);

  const onToggleLyrics = useCallback(() => toggleRightPanel('lyrics'), [toggleRightPanel]);
  const onToggleQueue = useCallback(() => toggleRightPanel('queue'), [toggleRightPanel]);

  // Celebrate a fresh favorite with a heart pop + expanding ring, scoped to the
  // current track so skipping onto an already-favorited track never misfires.
  const { heartControls, favoriteBurst, showFavoriteBurst } = useFavoriteCelebration(
    isFavorite,
    currentTrack?.id
  );

  return {
    t,
    currentTrack,
    // Radio only: the station's ICY `StreamTitle` when one has arrived, the
    // station name otherwise. Identical to `currentTrack.title` for everything
    // else, so the bar renders one value rather than branching.
    titleText,
    isRadio,
    isFavorite,
    showSeekRow,
    ambientColor,
    lowPerformanceMode,
    durationLabel: formatDuration(duration),
    showAlbumArt,
    showFavorite,
    showFavoriteButton,
    showTimeLabels,
    showSleepTimer,
    showEqualizer,
    showCompactButton,
    showVisualizerButton,
    showLyricsButton,
    showQueueButton,
    showVolume,
    showWaveformSeekbar,
    hasUtilityButtons,
    hasButtonCluster,
    nowPlayingViewEnabled,
    showVisualizer,
    lyricsActive: rightPanel === 'lyrics',
    queueActive: rightPanel === 'queue',
    heartControls,
    favoriteBurst,
    showFavoriteBurst,
    compactTooltip: t('compactModeTooltip', { shortcut: `${MOD}+Shift+M` }),
    visualizerTooltip: t('visualizerTooltip'),
    lyricsTooltip: t('lyricsTooltip', { shortcut: `${MOD}+L` }),
    queueTooltip: t('queueTooltip', { shortcut: `${MOD}+Q` }),
    onToggleFavorite,
    onEnterCompact,
    onToggleVisualizer: toggleVisualizer,
    onToggleLyrics,
    onToggleQueue,
    onEnterNowPlaying: enterNowPlaying,
  };
}
