import { useAmbientColor } from '@/hooks/useAmbientColor';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export function AmbientBackground() {
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const ambientColor = useAmbientColor();
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const noiseOverlayEnabled = useUIStore(s => s.noiseOverlayEnabled);
  const prefersReducedMotion = useReducedMotion();

  if (lowPerformanceMode) return null;

  return (
    <>
      {noiseOverlayEnabled && <div className="noise" />}

      <AnimatePresence>
        {currentTrack && (
          <motion.div
            key={ambientColor.hex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 2 }}
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              background: `
                radial-gradient(ellipse at 10% 20%, rgba(${ambientColor.rgb}, 0.1) 0%, transparent 60%),
                radial-gradient(ellipse at 90% 80%, rgba(${ambientColor.rgb}, 0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(${ambientColor.rgb}, 0.03) 0%, transparent 70%)
              `,
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
