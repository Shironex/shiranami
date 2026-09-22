import { cn } from '@/lib/utils';
import { LyricLineButton } from '../LyricsList/LyricLineButton';
import { useLyricsFocus } from './LyricsFocus.hooks';
import type { ILyricsFocusProps } from './LyricsFocus.types';

/**
 * The depth-of-field presentation for synced lyrics: the active line large and
 * centered in the display serif, neighbours receding in blur and opacity like
 * they're underwater, each new line rising into focus on its timestamp. During
 * instrumental stretches of six seconds or more, three dots breathe in the
 * accent color instead of leaving the stage blank. Every line stays a real
 * button — click-to-seek and the accessible name survive the blur.
 */
export default function LyricsFocus(props: ILyricsFocusProps) {
  const { lines, showBreathingDots, blurEnabled } = useLyricsFocus(props);
  const { onLineClick, syncedDimOpacity, containerClassName } = props;

  const lineButtons = lines.map(line => (
    <div
      key={line.index}
      className={cn(
        'transition-all duration-500 max-w-[60ch]',
        line.distance === 1 && blurEnabled && 'blur-[1.5px]',
        line.distance >= 2 && blurEnabled && 'blur-[3px]',
        line.distance === 1 && !blurEnabled && 'scale-[0.97]',
        line.distance >= 2 && !blurEnabled && 'scale-95'
      )}
      style={{
        opacity: line.distance === 0 ? 1 : syncedDimOpacity / (line.distance + 0.5),
      }}
    >
      <LyricLineButton
        text={line.text}
        time={line.time}
        isActive={line.isActive}
        isPast={line.isPast}
        onSelect={onLineClick}
        baseClassName={cn(
          'block w-full text-center font-serif leading-snug cursor-pointer rounded-md px-2',
          'transition-all duration-500',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40'
        )}
        activeClassName="italic text-3xl @5xl:text-4xl text-foreground"
        pastClassName="text-lg @5xl:text-xl text-foreground"
        idleClassName="text-lg @5xl:text-xl text-foreground"
      />
    </div>
  ));

  return (
    <div
      data-slot="lyrics-focus"
      className={cn(
        'flex-1 min-h-0 flex flex-col items-center justify-center gap-4 overflow-hidden',
        containerClassName
      )}
    >
      {lineButtons}

      {showBreathingDots && (
        <div
          data-slot="breathing-dots"
          aria-hidden="true"
          className="flex items-center gap-2.5 py-2"
        >
          <span className="animate-pulse-subtle w-2 h-2 rounded-full bg-primary/80" />
          <span className="animate-pulse-subtle w-2 h-2 rounded-full bg-primary/80 [animation-delay:0.45s]" />
          <span className="animate-pulse-subtle w-2 h-2 rounded-full bg-primary/80 [animation-delay:0.9s]" />
        </div>
      )}
    </div>
  );
}
