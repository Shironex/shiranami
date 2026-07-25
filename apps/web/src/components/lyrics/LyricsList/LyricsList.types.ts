import type { Ref, ReactElement } from 'react';
import type { LyricLine } from '@/hooks/queries/useLyrics';

export interface ILyricsListProps {
  readonly lines: LyricLine[];
  readonly activeIndex: number;
  readonly onLineClick: (time: number) => void;
  readonly containerClassName?: string;
  readonly spacingClassName?: string;
  readonly bottomSpacerClassName?: string;
  readonly baseClassName: string;
  readonly activeClassName: string;
  readonly pastClassName: string;
  readonly idleClassName: string;
}

export interface ILyricsListView {
  /** Ref attached to the active line so the hook can scroll it into view. */
  readonly activeLineRef: Ref<HTMLButtonElement>;
  /** Prebuilt per-line button elements (computed off-JSX). */
  readonly lineButtons: readonly ReactElement[];
}
