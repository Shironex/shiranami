import { useUIStore } from '@/stores/useUIStore';
import { useMarqueeOnOverflow } from '@/hooks/useMarqueeOnOverflow';
import { cn } from '@/lib/utils';
import type { ICompactMarqueeTextProps } from './CompactPlayer.types';

/**
 * Single-line text that scrolls horizontally on hover when it overflows.
 *
 * Static state: the parent clips with `overflow:hidden` and a horizontal
 * mask-image fades the right edge so the cut feels intentional (no ellipsis,
 * since the marquee target is an inline-block child).
 *
 * Active state (hover/focus): the inner span animates by exactly its measured
 * `scrollWidth - clientWidth` overflow distance, returns home, repeats.
 *
 * Falls back to a static line under `lowPerformanceMode` to honor that user
 * preference. Tooltip still surfaces the full text for screen readers and
 * mouse users in either mode.
 */
export function CompactMarqueeText({ text, className }: ICompactMarqueeTextProps) {
  // Ref must be on the clipped parent (`<p>`), not the inline-block span.
  // scrollWidth/clientWidth on the unconstrained span are equal — the
  // overflow signal lives on the constrained container.
  const { ref, overflows, shift } = useMarqueeOnOverflow<HTMLParagraphElement>(text);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const animate = overflows && !lowPerformanceMode;

  return (
    <p
      ref={ref}
      tabIndex={overflows ? 0 : -1}
      className={cn(
        'group/marquee block w-full overflow-hidden whitespace-nowrap focus:outline-none',
        overflows &&
          '[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]',
        className
      )}
      title={overflows ? text : undefined}
    >
      <span
        className={cn(
          'inline-block whitespace-nowrap will-change-transform',
          animate &&
            'group-hover/marquee:animate-marquee group-focus-visible/marquee:animate-marquee'
        )}
        style={animate ? ({ '--marquee-shift': `${shift}px` } as React.CSSProperties) : undefined}
      >
        {text}
      </span>
    </p>
  );
}
