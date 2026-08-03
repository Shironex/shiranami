import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import type {
  IAmbientBackgroundView,
  IArtBloomLayer,
  IArtBloomSlots,
} from './AmbientBackground.types';

/**
 * The four cover copies of the artwork bloom: sizes echo
 * Apple Music's 25/50/80/125% viewport ladder, blur radii scale with the
 * viewport so 4K stays smooth, and every rotation period is minutes-long so
 * the drift is felt rather than seen. Alternating layers counter-rotate, and
 * each one's off-center transform-origin turns its spin into a slow orbit.
 */
export const ART_BLOOM_LAYERS: readonly IArtBloomLayer[] = [
  {
    size: '125vmax',
    top: '50%',
    left: '50%',
    blur: 'min(9vw, 130px)',
    saturate: 1.7,
    opacity: 0.35,
    duration: 660,
    reverse: false,
    origin: '48% 52%',
  },
  {
    size: '80vmax',
    top: '18%',
    left: '82%',
    blur: 'min(7vw, 110px)',
    saturate: 1.8,
    opacity: 0.3,
    duration: 540,
    reverse: true,
    origin: '42% 58%',
  },
  {
    size: '50vmax',
    top: '85%',
    left: '12%',
    blur: 'min(6vw, 90px)',
    saturate: 1.9,
    opacity: 0.28,
    duration: 420,
    reverse: false,
    origin: '58% 40%',
  },
  {
    size: '25vmax',
    top: '20%',
    left: '18%',
    blur: 'min(4.5vw, 70px)',
    saturate: 2,
    opacity: 0.25,
    duration: 300,
    reverse: true,
    origin: '38% 62%',
  },
];

/**
 * Owns the ambient background's state: the currently-playing track gate, the
 * cover URL feeding the artwork bloom, the extracted album-art color for the
 * no-art glow fallback, the noise-overlay/low-perf UI toggles, and the
 * reduced-motion preference. The shell only renders.
 */
export function useAmbientBackground(): IAmbientBackgroundView {
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const ambientColor = useAmbientColor();
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const noiseOverlayEnabled = useUIStore(s => s.noiseOverlayEnabled);
  const reducedMotion = useReducedMotion();

  // The bloom needs canvas-free cover pixels; tracks without art keep the
  // extracted-color glow so the background never goes flat black.
  const artUrl = currentTrack?.albumArt ?? null;

  // Two-slot crossfader: a track change moves the shown cover into the
  // outgoing slot, *replacing* whatever was already fading out. Cancel, not
  // queue — skipping five tracks fast leaves two layers, never five.
  const [bloomSlots, setBloomSlots] = useState<IArtBloomSlots>({
    current: artUrl,
    previous: null,
  });
  useEffect(() => {
    setBloomSlots(slots =>
      slots.current === artUrl ? slots : { current: artUrl, previous: slots.current }
    );
  }, [artUrl]);
  const onPreviousBloomDone = useCallback(() => {
    setBloomSlots(slots => (slots.previous === null ? slots : { ...slots, previous: null }));
  }, []);

  const glowBackground = `
                radial-gradient(ellipse at 10% 20%, rgba(${ambientColor.rgb}, 0.1) 0%, transparent 60%),
                radial-gradient(ellipse at 90% 80%, rgba(${ambientColor.rgb}, 0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(${ambientColor.rgb}, 0.03) 0%, transparent 70%)
              `;

  return {
    enabled: !lowPerformanceMode,
    showNoiseOverlay: noiseOverlayEnabled,
    bloomSlots,
    // The visual change rides the audio one: the cross-dissolve spans the
    // audio crossfade when it is on, a calm default when it is not, and is
    // instant under reduced motion.
    artFadeDuration: reducedMotion ? 0 : crossfadeEnabled ? crossfadeDuration : 1.2,
    onPreviousBloomDone,
    showGlow: Boolean(currentTrack) && !artUrl,
    glowKey: ambientColor.hex,
    glowBackground,
    transitionDuration: reducedMotion ? 0 : 2,
    // Bloom pulse on track change. Low-perf already disables the whole layer via
    // `enabled`, so only the reduced-motion preference needs gating here.
    bloomKey: currentTrack?.id,
    showBloom: Boolean(currentTrack) && !reducedMotion,
  };
}
