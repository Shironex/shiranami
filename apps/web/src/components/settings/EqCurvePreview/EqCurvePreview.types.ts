export interface IEqCurvePreviewTick {
  /** Band frequency in Hz (stable list key). */
  readonly freq: number;
  /** Formatted axis-tick label for the frequency. */
  readonly label: string;
}

export interface IEqCurvePreviewProps {
  /** Per-band gains in dB (one per `EQ_BANDS` entry), driving the curve shape. */
  readonly gains: number[];
  /** Global preamp gain in dB, applied across the whole curve. */
  readonly preampDb: number;
  /** Dims the curve when the EQ is disabled, mirroring the band strip. */
  readonly disabled?: boolean;
}

export interface IEqCurvePreviewView {
  /** Localized aria-label for the SVG curve. */
  readonly ariaLabel: string;
  /** Stable gradient id for the area fill (collision-free across instances). */
  readonly gradientId: string;
  /** SVG path for the response line. */
  readonly linePath: string;
  /** SVG path for the filled area under the line. */
  readonly areaPath: string;
  /** Y coordinate of the 0 dB baseline. */
  readonly zeroY: number;
  /** Whether the curve is dimmed (EQ disabled). */
  readonly disabled: boolean;
  /** Frequency axis ticks rendered below the curve (bass → treble). */
  readonly ticks: readonly IEqCurvePreviewTick[];
}
