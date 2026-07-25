import type { CSSProperties, RefObject } from 'react';

/** Props for the compact single-line marquee text. */
export interface ICompactMarqueeTextProps {
  /** Text content; scrolls on hover when it overflows its container. */
  readonly text: string;
  /** Extra class names for the clipped line. */
  readonly className?: string;
}

/** View model for the compact single-line marquee text. */
export interface ICompactMarqueeTextView {
  /** Ref for the clipped line — the element overflow is measured on. */
  readonly ref: RefObject<HTMLParagraphElement | null>;
  /** Text rendered inside the scrolling span. */
  readonly text: string;
  /** Tab stop for the line: focusable only while it is clipped. */
  readonly tabIndex: number;
  /** Full text as a native tooltip while clipped, `undefined` when it fits. */
  readonly title: string | undefined;
  /** Resolved class names for the clipped line (mask + caller overrides). */
  readonly lineClassName: string;
  /** Resolved class names for the inner span (marquee utilities when active). */
  readonly spanClassName: string;
  /** `--marquee-shift` carrier for the inner span, `undefined` when static. */
  readonly spanStyle: CSSProperties | undefined;
}
