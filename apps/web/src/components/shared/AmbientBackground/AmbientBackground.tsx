import { motion, AnimatePresence } from 'motion/react';
import { useAmbientBackground } from './AmbientBackground.hooks';

/**
 * The slow album-art color glow + optional film-grain noise overlay painted at
 * z-0 behind the shell. Disabled entirely under low-performance mode; the glow
 * only appears while a track is playing and cross-fades when the dominant cover
 * color changes (instant under prefers-reduced-motion).
 */
export default function AmbientBackground() {
  const {
    enabled,
    showNoiseOverlay,
    showGlow,
    glowKey,
    glowBackground,
    transitionDuration,
    bloomKey,
    showBloom,
  } = useAmbientBackground();

  if (!enabled) return null;

  return (
    <>
      {showNoiseOverlay && <div className="noise" />}

      <AnimatePresence>
        {showGlow && (
          <motion.div
            key={glowKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: transitionDuration }}
            className="fixed inset-0 pointer-events-none z-0"
            style={{ background: glowBackground }}
          />
        )}
      </AnimatePresence>

      {/* Track-change "bloom": a brief opacity/scale pulse over the same glow
          color. Keyed on the track id so a change remounts it and replays the
          keyframe. Sits above the steady glow; purely decorative. */}
      {showBloom && (
        <motion.div
          key={`bloom-${bloomKey}`}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.55, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 1.1, ease: 'easeOut', times: [0, 0.3, 1] }}
          className="fixed inset-0 pointer-events-none z-0"
          style={{ background: glowBackground }}
        />
      )}
    </>
  );
}
