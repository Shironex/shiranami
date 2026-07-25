import type { CSSProperties } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useMarqueeOnOverflow } from '@/hooks/useMarqueeOnOverflow';
import { cn } from '@/lib/utils';
import type { ICompactMarqueeTextProps, ICompactMarqueeTextView } from './CompactMarqueeText.types';

/**
 * Measures the clipped line and resolves everything the marquee shell renders:
 * the overflow-dependent mask, tab stop and tooltip, plus the animation
 * utilities and the `--marquee-shift` distance.
 *
 * `lowPerformanceMode` suppresses the animation only — an overflowing line
 * stays clipped, focusable and tooltipped in either mode, so the full text is
 * always reachable.
 */
export function useCompactMarqueeText({
  text,
  className,
}: ICompactMarqueeTextProps): ICompactMarqueeTextView {
  // Ref must be on the clipped parent (`<p>`), not the inline-block span.
  // scrollWidth/clientWidth on the unconstrained span are equal — the
  // overflow signal lives on the constrained container.
  const { ref, overflows, shift } = useMarqueeOnOverflow<HTMLParagraphElement>(text);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const animate = overflows && !lowPerformanceMode;

  return {
    ref,
    text,
    tabIndex: overflows ? 0 : -1,
    title: overflows ? text : undefined,
    lineClassName: cn(
      'group/marquee block w-full overflow-hidden whitespace-nowrap focus:outline-none',
      overflows &&
        '[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]',
      className
    ),
    spanClassName: cn(
      'inline-block whitespace-nowrap will-change-transform',
      animate && 'group-hover/marquee:animate-marquee group-focus-visible/marquee:animate-marquee'
    ),
    spanStyle: animate ? ({ '--marquee-shift': `${shift}px` } as CSSProperties) : undefined,
  };
}
