import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { IPlayerControlsView } from './PlayerControls.types';

export function usePlayerControls(): IPlayerControlsView {
  const { t } = useTranslation('player');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const isLoading = usePlaybackStore(s => s.isLoading);
  const isShuffled = usePlaybackStore(s => s.isShuffled);
  const repeatMode = usePlaybackStore(s => s.repeatMode);
  const togglePlay = usePlaybackStore(s => s.togglePlay);
  const next = usePlaybackStore(s => s.next);
  const previous = usePlaybackStore(s => s.previous);
  const toggleShuffle = usePlaybackStore(s => s.toggleShuffle);
  const cycleRepeatMode = usePlaybackStore(s => s.cycleRepeatMode);

  const showLoading = isLoading && !isPlaying;
  const repeatActive = repeatMode !== 'off';
  const repeatOne = repeatMode === 'one';

  const repeatTooltip =
    repeatMode === 'off' ? t('repeatOff') : repeatMode === 'all' ? t('repeatAll') : t('repeatOne');

  return {
    t,
    hasTrack: Boolean(currentTrack),
    isPlaying,
    showLoading,
    isShuffled,
    repeatMode,
    repeatActive,
    repeatOne,
    repeatTooltip,
    shuffleTooltip: isShuffled ? t('shuffleOn') : t('shuffleOff'),
    playPauseTooltip: isPlaying ? t('pauseSpace') : t('playSpace'),
    playPauseLabel: isPlaying ? t('pause') : t('play'),
    repeatLabel: t('repeatAria', { mode: repeatMode }),
    onTogglePlay: togglePlay,
    onNext: next,
    onPrevious: previous,
    onToggleShuffle: toggleShuffle,
    onCycleRepeatMode: cycleRepeatMode,
  };
}
