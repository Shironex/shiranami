import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * Handlers that `motion.div` re-types with its own animation/drag signatures.
 * They're dropped from the plain-div prop set so the props stay assignable to
 * both a native `<div>` and a `motion.div` (StaggerList never forwards them).
 */
type MotionConflictingProps = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart';

export interface IStaggerListProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  MotionConflictingProps
> {
  /** List items — each keeps its own `STAGGER_ITEM` variants. */
  readonly children: ReactNode;
}

export interface IStaggerListView {
  /** When `true`, render a plain div and skip the staggered container animation. */
  readonly reducedMotion: boolean;
}
