import { cn } from '@/lib/utils';
import type { ILyricLineButtonProps, ILyricLineButtonView } from './LyricLineButton.types';

/**
 * One instance renders per lyric line, so this hook stays deliberately bare: a
 * class merge and a click closure, with no memoization. `useCallback` would
 * allocate the same closure and then pay for a deps comparison on top, which is
 * the wrong trade on a list that re-renders on every playback tick.
 */
export function useLyricLineButton({
  text,
  time,
  isActive,
  isPast,
  onSelect,
  activeRef,
  baseClassName,
  activeClassName,
  pastClassName,
  idleClassName,
}: ILyricLineButtonProps): ILyricLineButtonView {
  return {
    text,
    className: cn(
      baseClassName,
      isActive && activeClassName,
      isPast && pastClassName,
      !isActive && !isPast && idleClassName
    ),
    buttonRef: isActive ? activeRef : null,
    onClick: () => onSelect(time),
  };
}
