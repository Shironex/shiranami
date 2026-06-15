import type { WeatherCurrent } from '@shiranami/contracts';

export interface IGreetingHeroView {
  /** Eyebrow label above the greeting ("Your sanctuary"). */
  readonly eyebrow: string;
  /** Greeting headline ("Good evening."). */
  readonly greeting: string;
  /** Emphasized mood subline ("It's quiet out there."). */
  readonly greetingSubline: string;
  /** Session summary / no-tracks copy under the greeting. */
  readonly subtitle: string;
  /** Large decorative kanji watermark for the current time of day. */
  readonly watermark: string;
  /** Whether the blinking eyebrow dot animation should be suppressed. */
  readonly reducedMotion: boolean;
  /** Whether the weather feature is enabled AND located — drives the weather row. */
  readonly weatherActive: boolean;
  /** Current weather payload, when fetched. */
  readonly weather: WeatherCurrent | undefined;
  /** Whether the weather query errored (the row degrades to "unavailable"). */
  readonly weatherError: boolean;
  /** "City, Country" geocode label for the weather row. */
  readonly cityLabel: string | undefined;
  /** Weather mood glyph for the clock card, when weather is active. */
  readonly clockGlyph: string | undefined;
}
