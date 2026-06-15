import type { LucideIcon } from 'lucide-react';
import type { RefObject } from 'react';

export interface IVolumeControlProps {
  /** Tailwind width class for the slider. Defaults to `w-24`. */
  readonly sliderClassName?: string;
}

/** View model for the volume button + slider. */
export interface IVolumeControlView {
  /** Container ref the wheel listener is attached to. */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /** Icon reflecting the current volume/mute state. */
  readonly VolumeIcon: LucideIcon;
  /** Slider position (0 while muted, regardless of stored volume). */
  readonly sliderValue: number;
  /** Localized `aria-label` for the mute toggle button. */
  readonly buttonLabel: string;
  /** Localized tooltip for the mute toggle button. */
  readonly buttonTooltip: string;
  /** Localized `aria-label` for the slider. */
  readonly sliderLabel: string;
  /** Toggle mute on/off. */
  readonly onToggleMute: () => void;
  /** Commit a slider drag (single-element value array from the primitive). */
  readonly onVolumeChange: (value: number[]) => void;
}
