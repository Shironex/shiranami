import type { DoctorSeverity } from '@shiranami/contracts';

/** One finding, localized and ready to render. */
export interface IDoctorFindingItem {
  /** Stable list key (`trackId:kind`). */
  readonly key: string;
  /** Track title, the row's headline. */
  readonly title: string;
  /** Localized description of what was found, numbers included. */
  readonly label: string;
  /** The file on disk, shown as secondary detail. */
  readonly filePath: string;
  /** Drives the severity dot's colour. */
  readonly severity: DoctorSeverity;
}

export interface ILibraryDoctorCardView {
  /** Localized card title. */
  readonly title: string;
  /** Localized card subtitle. */
  readonly subtitle: string;
  /** Localized idle description (call to action before the first run). */
  readonly idleLabel: string;
  /** Whether a check is running. */
  readonly running: boolean;
  /** Localized progress line while running, `null` when idle. */
  readonly progressLabel: string | null;
  /** Localized "Run check" button label. */
  readonly runLabel: string;
  /** Localized "Cancel" button label. */
  readonly cancelLabel: string;
  /** Start a health check over the library. */
  readonly onRun: () => void;
  /** Cancel the in-progress check. */
  readonly onCancel: () => void;
  /** Localized result summary line, `null` before the first run. */
  readonly summaryLabel: string | null;
  /** Whether the last run found nothing at all. */
  readonly allHealthy: boolean;
  /** Findings, severity-ranked (errors first). Empty before the first run. */
  readonly findings: readonly IDoctorFindingItem[];
}
