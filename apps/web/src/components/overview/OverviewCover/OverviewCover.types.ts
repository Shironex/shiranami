export interface IOverviewCoverProps {
  readonly albumArt?: string | null;
  readonly title: string;
  /** Seed for the deterministic gradient + glyph (album or artist name). */
  readonly seed: string;
  readonly className?: string;
}

export interface IOverviewCoverView {
  /** Degrees of hue rotation applied to the fallback gradient (theme re-tint). */
  readonly rotate: number;
  /** Representative glyph drawn from the seed when there's no album art. */
  readonly glyph: string;
}
