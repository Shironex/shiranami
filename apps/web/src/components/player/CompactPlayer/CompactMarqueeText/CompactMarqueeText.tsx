import { useCompactMarqueeText } from './CompactMarqueeText.hooks';
import type { ICompactMarqueeTextProps } from './CompactMarqueeText.types';

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
export default function CompactMarqueeText(props: ICompactMarqueeTextProps) {
  const { ref, text, tabIndex, title, lineClassName, spanClassName, spanStyle } =
    useCompactMarqueeText(props);

  return (
    <p ref={ref} tabIndex={tabIndex} className={lineClassName} title={title}>
      <span className={spanClassName} style={spanStyle}>
        {text}
      </span>
    </p>
  );
}
