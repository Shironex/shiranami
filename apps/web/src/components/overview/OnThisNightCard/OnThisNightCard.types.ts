import type { OnThisNightMemory } from '@/hooks/queries/useMemories';

export interface IOnThisNightCardProps {
  /** The anniversary memory to narrate. */
  readonly memory: OnThisNightMemory;
  /** Play the remembered track (queued from the library). */
  readonly onPlay: (trackId: string) => void;
}

export interface IOnThisNightCardView {
  /** Card heading ("A year ago,"). */
  readonly title: string;
  /** Emphasized tail of the heading ("tonight."). */
  readonly titleEm: string;
  /** The anniversary date eyebrow, localized. */
  readonly dateLabel: string;
  /** One prose line about the remembered plays. */
  readonly line: string;
  /** Remembered track title. */
  readonly trackTitle: string;
  /** "Artist · Album" (or just the artist) under the title. */
  readonly trackSubtitle: string;
  /** Album art, when the track has any. */
  readonly albumArt: string | null;
  /** Deterministic fallback-cover seed. */
  readonly coverSeed: string;
  /** Accessible label for the play row. */
  readonly playAria: string;
}
