/**
 * MascotIdleNote is a fixed decorative flourish with nothing to configure, so
 * its props surface is intentionally empty — the shape keeps the per-component
 * contract consistent across the feature.
 */
export interface IMascotIdleNoteProps {}

export interface IMascotIdleNoteView {
  /** False under `prefers-reduced-motion` — the note is motion-only, so it unmounts entirely. */
  readonly isVisible: boolean;
  /** Seconds before the first note drifts up, randomized per mount. */
  readonly initialDelay: number;
  /** Seconds of quiet between notes, randomized per mount. */
  readonly gap: number;
}
