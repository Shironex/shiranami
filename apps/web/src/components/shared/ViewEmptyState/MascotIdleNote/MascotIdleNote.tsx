import { motion } from 'motion/react';
import { Music2 } from 'lucide-react';
import { useMascotIdleNote } from './MascotIdleNote.hooks';

/**
 * A single music note that drifts up from the mascot's headphones once every
 * so often — a rare idle micro-moment, deliberately easy to overlook. The
 * mascot is a flat PNG, so this is a small overlaid element rather than an edit
 * to the image; it sits inside the mascot's `relative` frame, is purely
 * decorative (`aria-hidden`, no pointer events) and does not affect layout.
 */
export default function MascotIdleNote() {
  const { isVisible, initialDelay, gap } = useMascotIdleNote();

  if (!isVisible) return null;

  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute left-[38%] top-3 z-10 text-primary/60"
      initial={{ opacity: 0, y: 0, x: 0, scale: 0.7, rotate: 0 }}
      animate={{
        opacity: [0, 0.6, 0],
        y: [0, -14, -28],
        x: [0, 3, 7],
        scale: [0.7, 1, 1],
        rotate: [0, 6, 12],
      }}
      transition={{
        duration: 2.4,
        times: [0, 0.4, 1],
        ease: 'easeOut',
        delay: initialDelay,
        repeat: Infinity,
        repeatDelay: gap,
      }}
    >
      <Music2 className="h-3.5 w-3.5" strokeWidth={1.75} />
    </motion.span>
  );
}
