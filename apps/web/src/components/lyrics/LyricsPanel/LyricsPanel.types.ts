import type { ReactNode } from 'react';
import type { useTranslation } from 'react-i18next';
import type { LyricLine } from '@/hooks/queries/useLyrics';

export type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ILyricsPanelProps {
  /** Optional control rendered at the right edge of the panel header. */
  readonly headerAction?: ReactNode;
}

export interface ILyricsPanelView {
  /** Bound `lyrics` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** False when no track is playing — the panel renders nothing. */
  readonly hasTrack: boolean;
  /** Timed lyric lines for the current track, or null. */
  readonly synced: LyricLine[] | null;
  /** Plain (untimed) lyrics for the current track, or null. */
  readonly plain: string | null;
  /** Index of the active synced line, or -1. */
  readonly activeLine: number;
  /** Lyrics fetch in flight. */
  readonly isLoading: boolean;
  /** Translated source-badge label (Local / Embedded / LRCLIB), or null when unresolved. */
  readonly sourceLabel: string | null;
  /** Seek to a line's timestamp. */
  readonly onLineClick: (time: number) => void;
  /** Idle/past synced-line dim opacity from user prefs. */
  readonly syncedDimOpacity: number;
  /** Plain-lyrics text opacity from user prefs. */
  readonly plainOpacity: number;
  /** Composed base class for synced lines (affordances + sized text). */
  readonly syncedBaseClassName: string;
  /** Composed active-line class (affordances + next-size-up text). */
  readonly syncedActiveClassName: string;
  /** Class for past synced lines. */
  readonly syncedPastClassName: string;
  /** Class for idle synced lines. */
  readonly syncedIdleClassName: string;
  /** Composed class for the plain-lyrics text block. */
  readonly plainTextClassName: string;
}
