export interface IVerticalBandSliderProps {
  /** Center frequency of the band, in Hz (drives the axis label). */
  readonly freq: number;
  /** Current gain for the band, in dB. */
  readonly value: number;
  /** Commit a new gain (in dB) for the band. */
  readonly onChange: (db: number) => void;
  /** Whether the band is disabled (EQ off). */
  readonly disabled?: boolean;
  /** Accessible label for the slider. */
  readonly label: string;
  /** Tooltip heading (human-readable band name). */
  readonly bandName: string;
  /** Tooltip subline showing the current gain. */
  readonly gainLabel: string;
  /** Tailwind height class for the slider column. */
  readonly heightClass?: string;
}

export interface IVerticalBandSliderView {
  /** Gain range floor for the slider, in dB. */
  readonly min: number;
  /** Gain range ceiling for the slider, in dB. */
  readonly max: number;
  /** Slider step granularity, in dB. */
  readonly step: number;
  /** Current gain wrapped for the Radix slider's array value. */
  readonly value: number[];
  /** Whether the band is disabled. */
  readonly disabled: boolean;
  /** Accessible label for the slider. */
  readonly label: string;
  /** Tooltip heading. */
  readonly bandName: string;
  /** Tooltip subline. */
  readonly gainLabel: string;
  /** Tailwind height class for the slider column. */
  readonly heightClass: string;
  /** Pre-formatted axis label (e.g. `16k` for 16000 Hz). */
  readonly freqLabel: string;
  /** Commit a new gain from the Radix slider's array value. */
  readonly onValueChange: (next: number[]) => void;
}
