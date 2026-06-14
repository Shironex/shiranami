import type { ReactNode } from 'react';
import type { LyricLine } from '@/hooks/queries/useLyrics';

export interface ILyricsBodyProps {
  readonly synced: LyricLine[] | null;
  readonly plain: string | null;
  readonly activeLine: number;
  readonly isLoading: boolean;
  readonly onLineClick: (time: number) => void;

  /** Label shown in the loading branch. */
  readonly loadingLabel: string;
  /** Label shown in the empty branch. */
  readonly emptyLabel: string;

  /** Dynamic opacity for idle/past synced lines (drives the CSS vars). */
  readonly syncedDimOpacity: number;
  readonly plainOpacity: number;

  // Per-branch class hooks so each surface keeps its own sizing/spacing.
  readonly syncedContainerClassName?: string;
  readonly syncedSpacingClassName?: string;
  readonly syncedBottomSpacerClassName?: string;
  readonly syncedBaseClassName: string;
  readonly syncedActiveClassName: string;
  readonly syncedPastClassName: string;
  readonly syncedIdleClassName: string;
  readonly plainContainerClassName?: string;
  readonly plainTextClassName: string;
  /** Wrapper for the synced LyricsList — `'contents'` (NowPlaying) or a flex box. */
  readonly syncedWrapperClassName?: string;
  /** Optional override for the loading/empty branch container. */
  readonly stateContainerClassName?: string;
  /** Optional className for the empty-state icon + label group. */
  readonly emptyClassName?: string;
}

export interface ILyricsBodyView {
  /** The single resolved branch (loading → synced → plain → empty) to render. */
  readonly body: ReactNode;
}
