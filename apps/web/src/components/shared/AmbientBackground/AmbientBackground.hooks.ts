import { useReducedMotion } from 'motion/react';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import type { IAmbientBackgroundView } from './AmbientBackground.types';

/**
 * Owns the ambient-glow state: the currently-playing track gate, the extracted
 * album-art color, the noise-overlay/low-perf UI toggles, and the reduced-motion
 * preference. Builds the radial-gradient string and cross-fade duration so the
 * shell only renders.
 */
export function useAmbientBackground(): IAmbientBackgroundView {
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const ambientColor = useAmbientColor();
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const noiseOverlayEnabled = useUIStore(s => s.noiseOverlayEnabled);
  const reducedMotion = useReducedMotion();

  const glowBackground = `
                radial-gradient(ellipse at 10% 20%, rgba(${ambientColor.rgb}, 0.1) 0%, transparent 60%),
                radial-gradient(ellipse at 90% 80%, rgba(${ambientColor.rgb}, 0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(${ambientColor.rgb}, 0.03) 0%, transparent 70%)
              `;

  return {
    enabled: !lowPerformanceMode,
    showNoiseOverlay: noiseOverlayEnabled,
    showGlow: Boolean(currentTrack),
    glowKey: ambientColor.hex,
    glowBackground,
    transitionDuration: reducedMotion ? 0 : 2,
    // Bloom pulse on track change. Low-perf already disables the whole layer via
    // `enabled`, so only the reduced-motion preference needs gating here.
    bloomKey: currentTrack?.id,
    showBloom: Boolean(currentTrack) && !reducedMotion,
  };
}
