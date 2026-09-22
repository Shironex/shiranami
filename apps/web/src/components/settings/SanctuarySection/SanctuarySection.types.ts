import type {
  SanctuaryClockFace,
  SanctuaryClockFormat,
  SanctuaryRotation,
  SanctuaryVariant,
} from '@/stores/useSanctuaryStore';

export interface ISanctuaryVariantOption {
  readonly value: SanctuaryVariant;
  readonly label: string;
  readonly isActive: boolean;
}

export interface ISanctuaryTrackInfoOption {
  readonly value: SanctuaryVariant;
  readonly label: string;
  readonly isShown: boolean;
}

export interface ISanctuaryClockFaceOption {
  readonly value: SanctuaryClockFace;
  readonly label: string;
  readonly isActive: boolean;
}

export interface ISanctuarySelectOption {
  readonly value: string;
  readonly label: string;
}

export interface ISanctuarySectionView {
  readonly title: string;
  readonly subtitle: string;

  /** Center-stage picker (cover / clock / vinyl); read-only under follow-the-day. */
  readonly variantTitle: string;
  readonly variantDescription: string;
  readonly variantOptions: readonly ISanctuaryVariantOption[];
  readonly variantsDisabled: boolean;
  readonly onSelectVariant: (variant: SanctuaryVariant) => void;

  /** Per-stage track-info visibility chips. */
  readonly trackInfoTitle: string;
  readonly trackInfoDescription: string;
  readonly trackInfoOptions: readonly ISanctuaryTrackInfoOption[];
  readonly onToggleTrackInfo: (variant: SanctuaryVariant) => void;

  /** Follow-the-day: the hour picks the stage (and clock treatment). */
  readonly timeOfDayLabel: string;
  readonly timeOfDayDescription: string;
  readonly timeOfDay: boolean;
  readonly onTimeOfDayChange: (enabled: boolean) => void;

  /** Stage auto-rotation (off / timer / each entry) and its timer window. */
  readonly rotationLabel: string;
  readonly rotationDescription: string;
  readonly rotation: SanctuaryRotation;
  readonly rotationOptions: readonly ISanctuarySelectOption[];
  readonly rotationDisabled: boolean;
  readonly onRotationChange: (value: string) => void;
  readonly showRotationMinutes: boolean;
  readonly rotationMinutesTitle: string;
  readonly rotationMinutesDescription: string;
  readonly rotationMinutesLabel: string;
  readonly rotationMinutes: number;
  readonly rotationMinutesMin: number;
  readonly rotationMinutesMax: number;
  readonly onRotationMinutesChange: (minutes: number) => void;

  /** Clock treatment: face, hour convention, seconds. */
  readonly clockFaceTitle: string;
  readonly clockFaceDescription: string;
  readonly clockFaceOptions: readonly ISanctuaryClockFaceOption[];
  readonly onSelectClockFace: (face: SanctuaryClockFace) => void;
  readonly clockFormatLabel: string;
  readonly clockFormatDescription: string;
  readonly clockFormat: SanctuaryClockFormat;
  readonly clockFormatOptions: readonly ISanctuarySelectOption[];
  readonly onClockFormatChange: (value: string) => void;
  readonly clockSecondsLabel: string;
  readonly clockSecondsDescription: string;
  readonly clockSeconds: boolean;
  readonly onClockSecondsChange: (enabled: boolean) => void;

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
