export interface ILibraryAnalysisCardView {
  /** Localized card title. */
  readonly title: string;
  /** Localized card subtitle. */
  readonly subtitle: string;
  /** Localized coverage line ("X of Y tracks carry tempo and key estimates"). */
  readonly coverageLabel: string;
  /** Whether every real track already carries its estimates. */
  readonly allAnalyzed: boolean;
  /** Whether a run is in progress. */
  readonly running: boolean;
  /** Localized progress line while running, `null` when idle. */
  readonly progressLabel: string | null;
  /** Localized "Analyze library" button label. */
  readonly runLabel: string;
  /** Localized "Cancel" button label. */
  readonly cancelLabel: string;
  /** Start a one-pass analysis run over the pending tracks. */
  readonly onRun: () => void;
  /** Cancel the in-progress run. */
  readonly onCancel: () => void;
}
