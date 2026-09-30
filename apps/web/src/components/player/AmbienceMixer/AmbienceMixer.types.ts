import type { LucideIcon } from 'lucide-react';
import type { useTranslation } from 'react-i18next';
import type { AmbientLayerId } from '@/stores/useAmbientStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IAmbienceMixerProps {
  /** Omit the trigger + popover chrome and just render the controls (settings section). */
  readonly inline?: boolean;
}

/** A render-ready layer row: its icon, name, slider value and labels. */
export interface IAmbienceLayerRow {
  readonly id: AmbientLayerId;
  readonly Icon: LucideIcon;
  /** Layer name shown next to the slider. */
  readonly label: string;
  /** Accessible name of the slider ("Rain volume"). */
  readonly sliderLabel: string;
  /** Slider position, 0 … 1. */
  readonly value: number;
  /** Formatted position ("40%"). */
  readonly percentLabel: string;
}

export interface IAmbienceMixerView {
  /** Bound `ambience` namespace translator. */
  readonly t: TranslateFn;
  readonly inline: boolean;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;

  /** Master switch. */
  readonly enabled: boolean;
  readonly layerRows: readonly IAmbienceLayerRow[];
  readonly sliderStep: number;
  readonly keepWhenPaused: boolean;
  readonly followWeather: boolean;
  /** "Follow the weather" is only offered while the opt-in weather is on. */
  readonly weatherAvailable: boolean;

  /** Stable ids for label ↔ control wiring. */
  readonly ids: {
    readonly enable: string;
    readonly enableDesc: string;
    readonly keep: string;
    readonly keepDesc: string;
    readonly follow: string;
    readonly followDesc: string;
    readonly layers: string;
  };

  readonly onToggleEnabled: (on: boolean) => void;
  readonly onLevelChange: (id: AmbientLayerId, level: number) => void;
  readonly onToggleKeepWhenPaused: (on: boolean) => void;
  readonly onToggleFollowWeather: (on: boolean) => void;
  readonly onReset: () => void;
}
