import type { Ref } from 'react';

export interface ILyricLineButtonProps {
  /** The lyric line's text — also the button's accessible name. */
  readonly text: string;
  /** Playback position this line starts at, in seconds. */
  readonly time: number;
  /** This is the line currently being sung. */
  readonly isActive: boolean;
  /** This line has already played. */
  readonly isPast: boolean;
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
  /** The list's active-line ref when active, otherwise unattached. */
  readonly buttonRef: Ref<HTMLButtonElement> | undefined;
  /** Seeks playback to this line's timestamp. */
  readonly onClick: () => void;
}
