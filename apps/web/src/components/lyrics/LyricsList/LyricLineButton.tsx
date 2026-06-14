import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { ILyricLineButtonProps } from './LyricsList.types';

export const LyricLineButton = memo(function LyricLineButton({
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
}: ILyricLineButtonProps) {
  const className = cn(
    baseClassName,
    isActive && activeClassName,
    isPast && pastClassName,
    !isActive && !isPast && idleClassName
  );

  return (
    <button
      ref={isActive ? activeRef : null}
      onClick={() => onSelect(time)}
      type="button"
      className={className}
    >
      {text}
    </button>
  );
});
