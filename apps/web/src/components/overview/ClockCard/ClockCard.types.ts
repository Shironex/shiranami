import type { ReactNode } from 'react';

export interface IClockCardProps {
  /**
   * Optional weather row injected by the parent. When absent, the card shows a
   * time-of-day kanji glyph + a quiet mood line and makes ZERO network calls.
   */
  readonly weatherRow?: ReactNode;
  /** Mood glyph override (e.g. a weather glyph). Defaults to the time-of-day glyph. */
  readonly glyph?: string;
}

export interface IClockCardView {
  /** Accessible label for the card container (stable, read once). */
  readonly ariaLabel: string;
  /** Locale-formatted hour segment of the time. */
  readonly hourPart: string;
  /** Locale-formatted minute segment of the time. */
  readonly minutePart: string;
  /** AM/PM (or locale equivalent) segment, when the locale uses one. */
  readonly dayPeriod: string | undefined;
  /** "SAT · 23 MAY · WK 21"-style date line. */
  readonly dateLine: string;
  /** Mood glyph (weather override or time-of-day glyph). */
  readonly resolvedGlyph: string;
  /** Fallback mood line shown when no weather row is supplied. */
  readonly moodLine: string;
  /** Whether the blinking colon animation should be suppressed. */
  readonly reducedMotion: boolean;
}
