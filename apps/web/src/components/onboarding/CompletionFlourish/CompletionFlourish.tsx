import { motion } from 'motion/react';
import { useCompletionFlourish } from './CompletionFlourish.hooks';

/**
 * A soft cluster of music notes that drifts up from the wizard's Finish button
 * the moment onboarding completes — a quiet send-off, not confetti. Mounted only
 * on genuine completion (never on skip) and only when motion is allowed, so the
 * parent already handles the reduced-motion / low-perf gate. It emits from the
 * top-center of its `relative` host and rises above it; purely decorative, so it
 * is `aria-hidden` and never captures pointer events.
 *
 * The notes fade with the wizard's own 520ms fog-out, so the flourish reads as
 * part of the dissolve rather than a separate beat.
 */
export default function CompletionFlourish() {
  const { notes } = useCompletionFlourish();

  const noteGlyphs = notes.map((note, i) => (
    <motion.span
      key={i}
      className="absolute left-1/2 top-0 text-primary/70"
      initial={{ opacity: 0, x: note.x, y: 8, scale: 0.6, rotate: 0 }}
      animate={{
        opacity: [0, 0.75, 0],
        x: note.x + note.drift,
        y: note.rise,
        scale: 1,
        rotate: note.rotate,
      }}
      transition={{
        duration: 1.1,
        delay: note.delay,
        ease: 'easeOut',
        opacity: { duration: 1.1, delay: note.delay, times: [0, 0.35, 1] },
      }}
    >
      <note.Icon style={{ width: note.size, height: note.size }} strokeWidth={1.75} />
    </motion.span>
  ));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
    >
      {noteGlyphs}
    </div>
  );
}
