import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IScanProgressCardView {
  /** Bound `settings` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** False while the scanner is idle — the card renders nothing. */
  readonly visible: boolean;
  /** Determinate scan progress, clamped to 0–100. */
  readonly progressPercent: number;
  /** Localized "scanning file N of M" (or generic scanning) status line. */
  readonly statusLabel: string;
  /** Path of the file currently being scanned, if any. */
  readonly currentFile: string | undefined;
  /** The scan is being cancelled — disables the cancel button and swaps its label. */
  readonly isCancelling: boolean;
  /** Localized label for the cancel button (cancel vs. cancelling). */
  readonly cancelLabel: string;
  /** Request cancellation of the in-flight scan. */
  readonly onCancel: () => void;
}
