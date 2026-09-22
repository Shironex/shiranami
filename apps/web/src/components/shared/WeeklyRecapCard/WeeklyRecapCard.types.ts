import type { WeeklyRecap } from '@/hooks/queries/useRecap';

export interface IWeeklyRecapCardProps {
  /** The derived recap to narrate. */
  readonly recap: WeeklyRecap;
  /**
   * Week-range label ("27 Jul – 2 Aug") for the archive context; omitted on
   * Overview, where the card always speaks about "the week" just finished.
   */
  readonly weekLabel?: string;
  /** Navigate to the archive ("Past weeks →"); omitted inside the archive. */
  readonly onOpenArchive?: () => void;
}

export interface IWeeklyRecapCardView {
  /** Unique id wiring the card section's `aria-labelledby` to its heading. */
  readonly headingId: string;
  /** Card heading ("The week, in short."). */
  readonly title: string;
  /** Emphasized tail of the heading. */
  readonly titleEm: string;
  /** Optional week-range eyebrow (archive context only). */
  readonly weekLabel: string | undefined;
  /** The prose lines, in order — already filtered to what is true this week. */
  readonly lines: readonly string[];
  /** "Past weeks" action label (rendered only when `onOpenArchive` exists). */
  readonly archiveLabel: string;
}
