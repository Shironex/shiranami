import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IStatsSectionProps {
  /** Section heading text, also the section's accessible name. */
  readonly title: string;
  /** Leading icon beside the heading (decorative). */
  readonly icon: LucideIcon;
  /** Optional supporting line beneath the heading row. */
  readonly caption?: string;
  /**
   * `'hero'` promotes the section into the page's focal panel (primary tint,
   * icon chip, larger heading); `'panel'` (the default) renders the quiet
   * section-card chrome.
   */
  readonly variant?: 'panel' | 'hero';
  /** Section body — brings its own top margin. */
  readonly children: ReactNode;
}

export interface IStatsSectionView {
  /** Unique id wiring the section's `aria-labelledby` to its heading. */
  readonly headingId: string;
  /** Section heading text, also the section's accessible name. */
  readonly title: string;
  /** Leading icon component, renamed for direct JSX use. */
  readonly Icon: LucideIcon;
  /** Optional supporting line beneath the heading row. */
  readonly caption?: string;
  /** Derived: whether the hero treatment applies. */
  readonly isHero: boolean;
  /** Section body — brings its own top margin. */
  readonly children: ReactNode;
}
