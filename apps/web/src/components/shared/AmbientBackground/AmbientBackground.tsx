import { motion, AnimatePresence } from 'motion/react';
import { useAmbientBackground, ART_BLOOM_LAYERS } from './AmbientBackground.hooks';

/**
 * The z-0 ambient layer behind the shell: four blurred, saturated copies of the
 * current cover drifting along slow counter-rotating orbits (the "artwork
 * bloom"), with the legacy color glow kept as the fallback for tracks that ship
 * no art. Disabled entirely under low-performance mode; the drift freezes to a
 * static collage under prefers-reduced-motion (see globals.css), and the whole
 * layer cross-fades on track change (instant under reduced motion).
 */
export default function AmbientBackground() {
  const {
    enabled,
    showNoiseOverlay,
    showArtBloom,
    artUrl,
    showGlow,
    glowKey,
    glowBackground,
    transitionDuration,
    bloomKey,
    showBloom,
  } = useAmbientBackground();

  if (!enabled) return null;

  // Built outside JSX render position (declarative-JSX rule) — one blurred
  // cover copy per layer. The inline `transform` centers each layer on its
  // anchor; while the spin animation runs it overrides that transform with the
  // same translate plus rotation, and under reduced motion the stylesheet
  // cancels the animation so the inline centering is what remains (a static
  // collage, not a missing background).
  const bloomLayers = ART_BLOOM_LAYERS.map(layer => (
    <img
      key={`${layer.size}-${layer.top}`}
      src={artUrl ?? undefined}
      alt=""
      draggable={false}
      decoding="async"
      className="art-bloom-layer absolute object-cover"
      style={{
        width: layer.size,
        height: layer.size,
        top: layer.top,
        left: layer.left,
        opacity: layer.opacity,
        filter: `blur(${layer.blur}) saturate(${layer.saturate})`,
        transformOrigin: layer.origin,
        transform: 'translate(-50%, -50%)',
        animation: `art-bloom-spin ${layer.duration}s linear infinite${layer.reverse ? ' reverse' : ''}`,
        willChange: 'transform',
      }}
    />
  ));

  return (
    <>
      {showNoiseOverlay && <div className="noise" />}

      <AnimatePresence>
        {showArtBloom && (
          <motion.div
            key={artUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: transitionDuration }}
            className="fixed inset-0 overflow-hidden pointer-events-none z-0"
            data-slot="art-bloom"
            aria-hidden="true"
          >
            {bloomLayers}
            {/* The bloom's own dim: it paints above ThemeBackground's scrim, so
                it must carry its own contrast floor rather than rely on one
                underneath it. bg-background keeps the veil theme-correct on
                both light and dark themes. */}
            <div className="absolute inset-0 bg-background/25" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGlow && (
          <motion.div
            key={glowKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: transitionDuration }}
            className="fixed inset-0 pointer-events-none z-0"
            data-slot="ambient-glow"
            style={{ background: glowBackground }}
          />
        )}
      </AnimatePresence>

      {/* Track-change "bloom": a brief opacity/scale pulse over the extracted
          glow color. Keyed on the track id so a change remounts it and replays
          the keyframe. Sits above the steady layers; purely decorative. */}
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
