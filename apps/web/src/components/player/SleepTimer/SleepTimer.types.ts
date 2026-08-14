import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { SleepStopMode } from '@/stores/useSleepTimerStore';
import type { WindDownLength } from '@/stores/useWindDownStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One render-ready wind-down length chip (0 = off). */
export interface IWindDownLengthChoice {
  /** Length in minutes; 0 turns the wind-down off. */
  readonly minutes: WindDownLength;
  /** Visible chip text ("Off", "5", "10", …). */
  readonly label: string;
  /** Accessible name ("Off", "5 minutes", …). */
  readonly ariaLabel: string;
  /** Whether this is the stored setting. */
  readonly selected: boolean;
}

/** One render-ready preset entry in the sleep-timer popover. */
export interface ISleepTimerPreset {
  /** Preset length in minutes (also the key). */
  readonly minutes: number;
  /** Localized button label (e.g. "30 minutes"). */
  readonly label: string;
}

/** View model for the sleep-timer button + popover. */
export interface ISleepTimerView {
  /** Bound `sleepTimer` namespace translator for the popover's static labels. */
  readonly t: TranslateFn;
  /** Whether the popover is open. */
  readonly open: boolean;
  /** Which popover face is shown. */
  readonly mode: 'presets' | 'custom';
  /** Current custom-minutes input value. */
  readonly customValue: string;
  /** Whether the custom input failed validation. */
  readonly customError: boolean;
  /** Ref for the custom-minutes input (wheel-adjustable). */
  readonly customInputRef: RefObject<HTMLInputElement | null>;
  /** Whether a timer is currently running. */
  readonly isActive: boolean;
  /** Whether the running timer is the wind-down ending (labels swap). */
  readonly isWindDown: boolean;
  /**
   * Localized label for an armed boundary stop ("Stopping after this
   * track/album"), or null when no boundary stop is armed. Replaces the
   * countdown in the popover — a boundary stop has no fixed end time.
   */
  readonly stopModeLabel: string | null;
  /** Formatted remaining time (mm:ss; minutes uncapped). */
  readonly remainingLabel: string;
  /** Localized trigger tooltip (countdown when active). */
  readonly tooltipText: string;
  /** Localized trigger `aria-label`. */
  readonly triggerLabel: string;
  /** Render-ready preset entries. */
  readonly presets: readonly ISleepTimerPreset[];
  /** Whether the wind-down setting is on (length > 0). */
  readonly windDownEnabled: boolean;
  /** Localized wind-down hint line (length when on, off-wording when off). */
  readonly windDownHint: string;
  /** Render-ready wind-down length chips (Off / 5 / 10 / 15 / 20). */
  readonly windDownLengthChoices: readonly IWindDownLengthChoice[];
  /** Lower bound for the custom input. */
  readonly minMinutes: number;
  /** Upper bound for the custom input. */
  readonly maxMinutes: number;
  /** Open/close the popover (resets to presets on open). */
  readonly onOpenChange: (next: boolean) => void;
  /** Start the timer for a preset and close. */
  readonly onSelectPreset: (minutes: number) => void;
  /** Start the wind-down ending and close. */
  readonly onSelectWindDown: () => void;
  /** Arm an end-of-track/end-of-album stop and close. */
  readonly onSelectStopAfter: (mode: SleepStopMode) => void;
  /** Store a wind-down length (0 = off). The popover stays open. */
  readonly onSelectWindDownLength: (minutes: WindDownLength) => void;
  /** Cancel a running timer and close. */
  readonly onCancel: () => void;
  /** Switch the popover to the custom-minutes face. */
  readonly onShowCustom: () => void;
  /** Switch the popover back to the preset face. */
  readonly onShowPresets: () => void;
  /** Edit the custom-minutes value. */
  readonly onCustomChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Submit the custom-minutes value on Enter. */
  readonly onCustomKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Validate + start the custom-minutes timer. */
  readonly onCustomSubmit: () => void;
}
