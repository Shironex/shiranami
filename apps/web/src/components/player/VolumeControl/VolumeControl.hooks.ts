import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { IVolumeControlView } from './VolumeControl.types';

/** Minimum gap between wheel-driven volume steps (ms). */
const WHEEL_THROTTLE_MS = 40;
/** Volume change per wheel notch. */
const WHEEL_STEP = 0.05;

export function useVolumeControl(): IVolumeControlView {
  const { t } = useTranslation('player');
  const volume = usePlaybackStore(s => s.volume);
  const isMuted = usePlaybackStore(s => s.isMuted);
  const setVolume = usePlaybackStore(s => s.setVolume);
  const toggleMute = usePlaybackStore(s => s.toggleMute);

  const onVolumeChange = useCallback(
    (value: number[]) => {
      setVolume(value[0]);
    },
    [setVolume]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const lastWheelTimeRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheelTimeRef.current < WHEEL_THROTTLE_MS) return;
      lastWheelTimeRef.current = now;
      const step = -Math.sign(e.deltaY) * WHEEL_STEP;
      if (step === 0) return;
      const { volume: current, isMuted: muted, setVolume } = usePlaybackStore.getState();
      if (muted && step < 0) return;
      setVolume(Math.round((current + step) * 100) / 100);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Transient percentage readout shown while the user hovers or drags the
  // slider. `dragging` is tracked separately so the label survives the pointer
  // straying off the track mid-drag.
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const showReadout = hovering || dragging;

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [dragging]);

  const onPointerEnter = useCallback(() => setHovering(true), []);
  const onPointerLeave = useCallback(() => setHovering(false), []);
  const onPointerDown = useCallback(() => setDragging(true), []);

  const isSilent = isMuted || volume === 0;
  const VolumeIcon = isSilent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return {
    containerRef,
    VolumeIcon,
    sliderValue: isMuted ? 0 : volume,
    buttonLabel: isMuted ? t('unmute') : t('mute'),
    buttonTooltip: isMuted ? t('unmuteTooltip') : t('muteTooltip'),
    sliderLabel: t('volume'),
    showReadout,
    onToggleMute: toggleMute,
    onVolumeChange,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
  };
}
