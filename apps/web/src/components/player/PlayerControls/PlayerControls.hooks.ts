import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnimationControls } from 'motion/react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { SPRING_SNAPPY, SPRING_BOUNCE } from '@/lib/motion';
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

  // Decorative transport motion falls back to plain state changes when
  // decorative motion is gated off (press/tap feedback still applies).
  const celebrate = useDecorativeMotion();

  const shuffleControls = useAnimationControls();
  const repeatControls = useAnimationControls();
  const prevShuffle = useRef(isShuffled);
  const prevRepeatMode = useRef(repeatMode);
  const repeatRotation = useRef(0);
  const prevPlaying = useRef(isPlaying);
  const [glowKey, setGlowKey] = useState(0);

  // Quick wobble the moment shuffle turns on.
  useEffect(() => {
    const turnedOn = isShuffled && !prevShuffle.current;
    prevShuffle.current = isShuffled;
    if (turnedOn && celebrate) {
      void shuffleControls.start({ rotate: [0, -15, 12, 0], transition: SPRING_BOUNCE });
    }
  }, [isShuffled, celebrate, shuffleControls]);

  // Flip the repeat glyph 180° on every mode cycle (accumulated so it never
  // snaps back to zero between cycles).
  useEffect(() => {
    const changed = repeatMode !== prevRepeatMode.current;
    prevRepeatMode.current = repeatMode;
    if (changed && celebrate) {
      repeatRotation.current += 180;
      void repeatControls.start({ rotate: repeatRotation.current, transition: SPRING_SNAPPY });
    }
  }, [repeatMode, celebrate, repeatControls]);

  // One-shot glow pulse when playback starts.
  useEffect(() => {
    const started = isPlaying && !prevPlaying.current;
    prevPlaying.current = isPlaying;
    if (started && celebrate) setGlowKey(k => k + 1);
  }, [isPlaying, celebrate]);

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
    shuffleControls,
    repeatControls,
    glowKey,
    showStartGlow: celebrate && glowKey > 0,
    onTogglePlay: togglePlay,
    onNext: next,
    onPrevious: previous,
    onToggleShuffle: toggleShuffle,
    onCycleRepeatMode: cycleRepeatMode,
  };
}
