/** Bottom-corner radius to match the host card (e.g. `rounded-b-2xl`). */
type DownloadProgressBarBase = { readonly className?: string };

/**
 * Determinate vs indeterminate is a discriminated union so the determinate
 * progressbar (which sets `role="progressbar"`) is type-forced to carry an
 * accessible name, while the indeterminate sweep (aria-hidden) takes neither.
 *
 * This stays a `type` alias (not an `I`-prefixed interface) because the
 * discriminated union can't be expressed as a single interface.
 */
export type DownloadProgressBarProps = DownloadProgressBarBase &
  (
    | {
        /**
         * 0–100 → DETERMINATE bar (fills to the percentage, exposes
         * `role="progressbar"` + aria values). Requires `ariaLabel`.
         */
        readonly progress: number;
        /** Accessible name for the determinate progressbar (required). */
        readonly ariaLabel: string;
      }
    | {
        /**
         * Omitted → INDETERMINATE sweep used where no real percentage exists
         * (recommendations/discover). The `.progress-sweep` animation is gated
         * for reduced-motion / low-perf in globals.css. It's aria-hidden, so no
         * accessible name is needed.
         */
        readonly progress?: undefined;
        readonly ariaLabel?: undefined;
      }
  );

export interface IDownloadProgressBarView {
  /** True when a real percentage is known → render the labelled determinate bar. */
  readonly isDeterminate: boolean;
  /** `progress` clamped to 0–100; meaningful only when {@link isDeterminate}. */
  readonly clamped: number;
}
