import { motion } from 'motion/react';
import { STAGGER_CONTAINER } from '@/lib/motion';
import { useStaggerList } from './StaggerList.hooks';
import type { IStaggerListProps } from './StaggerList.types';

/**
 * Renders its children inside a staggered motion container so list items cascade
 * in, or a plain `<div>` when the user prefers reduced motion. Children supply
 * their own `STAGGER_ITEM` variants; this wrapper only owns the container
 * animation and the reduced-motion branch (read here, not passed by callers).
 */
export default function StaggerList({ children, ...rest }: IStaggerListProps) {
  const { reducedMotion } = useStaggerList();

  if (reducedMotion) {
    return <div {...rest}>{children}</div>;
  }

  return (
    <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="visible" {...rest}>
      {children}
    </motion.div>
  );
}
