import type { CSSProperties, Ref } from 'react';
import type { LyricsAnimation } from '@/stores/useLyricsAppearanceStore';

export interface ILyricLineButtonProps {
  /** The lyric line's text — also the button's accessible name. */
  readonly text: string;
  /** Playback position this line starts at, in seconds. */
  readonly time: number;
  /** This is the line currently being sung. */
  readonly isActive: boolean;
  /** This line has already played. */
  readonly isPast: boolean;
  /**
   * Seconds the karaoke animation spans, passed only to the active line so the
   * memo still skips every other line. Absent: the line renders as plain text.
   */
  readonly duration?: number;
  /** Seeks playback to `time`. */
  readonly onSelect: (time: number) => void;
  /** Attached only while active, so the list can scroll this line into view. */
  readonly activeRef?: Ref<HTMLButtonElement>;
  /** Classes applied to every line regardless of state. */
  readonly baseClassName: string;
  /** Extra classes for the active line. */
  readonly activeClassName: string;
  /** Extra classes for lines that have already played. */
  readonly pastClassName: string;
  /** Extra classes for lines that have not played yet. */
  readonly idleClassName: string;
}

export interface ILyricLineButtonView {
  /** The lyric line's text. */
  readonly text: string;
  /** Merged base + state classes for the button. */
  readonly className: string;
  /** Render the text through the karaoke animation (active line with a duration). */
  readonly animated: boolean;
  /** The list's active-line ref when active, otherwise unattached. */
  readonly buttonRef: Ref<HTMLButtonElement> | undefined;
  /** Seeks playback to this line's timestamp. */
  readonly onClick: () => void;
}

export interface IKaraokeTextProps {
  readonly text: string;
  /** Playback position the line starts at, in seconds. */
  readonly time: number;
  /** Seconds the animation spans. */
  readonly duration: number;
}

/** One render-ready piece of the animated line. */
export interface IKaraokeWord {
  readonly text: string;
  /** Word span class, or `null` for the whitespace between words. */
  readonly className: string | null;
  /** Per-word animation timing (delay can be negative: already underway). */
  readonly style: CSSProperties | undefined;
}

export interface IKaraokeTextView {
  /** The chosen style after the reduced-motion fallback. */
  readonly animation: LyricsAnimation;
  /** Changes on every seek so the spans remount and restart in sync. */
  readonly syncKey: string;
  readonly words: readonly IKaraokeWord[];
}
