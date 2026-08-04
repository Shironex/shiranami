import type { SanctuaryVariant } from '@/stores/useSanctuaryStore';

export interface ISanctuaryVariantOption {
  readonly value: SanctuaryVariant;
  readonly label: string;
  readonly isActive: boolean;
}

export interface ISanctuarySectionView {
  readonly title: string;
  readonly subtitle: string;

  /** Center-stage picker (cover / clock). */
  readonly variantTitle: string;
  readonly variantDescription: string;
  readonly variantOptions: readonly ISanctuaryVariantOption[];
  readonly onSelectVariant: (variant: SanctuaryVariant) => void;

  /** Screensaver auto-entry. */
  readonly autoEnterLabel: string;
  readonly autoEnterDescription: string;
  readonly autoEnter: boolean;
  readonly onAutoEnterChange: (enabled: boolean) => void;

  /** Stillness window before auto-entry (only meaningful while opted in). */
  readonly minutesTitle: string;
  readonly minutesDescription: string;
  readonly minutesLabel: string;
  readonly minutes: number;
  readonly minutesMin: number;
  readonly minutesMax: number;
  readonly onMinutesChange: (minutes: number) => void;
}
