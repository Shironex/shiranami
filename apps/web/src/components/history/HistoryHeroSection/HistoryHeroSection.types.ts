import type { HistoryRange } from '@/components/history/historyUtils';

export interface IHistoryHeroSectionProps {
  readonly selectedRange: HistoryRange;
  readonly onRangeChange: (range: HistoryRange) => void;
}

/** A single range pill, with its active flag resolved by the hook. */
export interface IHistoryRangeOption {
  readonly id: HistoryRange;
  readonly label: string;
  readonly isActive: boolean;
}

export interface IHistoryHeroSectionView {
  /** Eyebrow label above the title. */
  readonly eyebrow: string;
  /** Hero headline. */
  readonly title: string;
  /** Hero subtitle, parameterized by the active range copy. */
  readonly subtitle: string;
  /** Range pills with resolved labels + active state, in display order. */
  readonly ranges: readonly IHistoryRangeOption[];
  /** Select a range (forwarded to the consumer's `onRangeChange`). */
  readonly onSelectRange: (range: HistoryRange) => void;
}
