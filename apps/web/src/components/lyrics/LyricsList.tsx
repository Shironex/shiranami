import { memo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LyricLine } from '@/hooks/queries/useLyrics';

interface LyricLineButtonProps {
  text: string;
  time: number;
  isActive: boolean;
  isPast: boolean;
  onSelect: (time: number) => void;
  activeRef?: React.Ref<HTMLButtonElement>;
  baseClassName: string;
  activeClassName: string;
  pastClassName: string;
  idleClassName: string;
}

const LyricLineButton = memo(function LyricLineButton({
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
}: LyricLineButtonProps) {
  return (
    <button
      ref={isActive ? activeRef : null}
      onClick={() => onSelect(time)}
      type="button"
      className={cn(
        baseClassName,
        isActive && activeClassName,
        isPast && pastClassName,
        !isActive && !isPast && idleClassName,
      )}
    >
      {text}
    </button>
  );
});

interface LyricsListProps {
  lines: LyricLine[];
  activeIndex: number;
  onLineClick: (time: number) => void;
  containerClassName?: string;
  spacingClassName?: string;
  bottomSpacerClassName?: string;
  baseClassName: string;
  activeClassName: string;
  pastClassName: string;
  idleClassName: string;
}

export const LyricsList = memo(function LyricsList({
  lines,
  activeIndex,
  onLineClick,
  containerClassName,
  spacingClassName,
  bottomSpacerClassName,
  baseClassName,
  activeClassName,
  pastClassName,
  idleClassName,
}: LyricsListProps) {
  const activeLineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  return (
    <div className={cn('flex-1 overflow-y-auto scrollbar-hide', containerClassName)}>
      <div className={spacingClassName}>
        {lines.map((line, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          return (
            <LyricLineButton
              key={index}
              text={line.text}
              time={line.time}
              isActive={isActive}
              isPast={isPast}
              onSelect={onLineClick}
              activeRef={activeLineRef}
              baseClassName={baseClassName}
              activeClassName={activeClassName}
              pastClassName={pastClassName}
              idleClassName={idleClassName}
            />
          );
        })}
        {bottomSpacerClassName && <div className={bottomSpacerClassName} />}
      </div>
    </div>
  );
});
