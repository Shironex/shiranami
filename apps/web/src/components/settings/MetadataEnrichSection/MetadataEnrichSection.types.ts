import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IMetadataEnrichSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Bound `common`-namespace translator (cancel label, etc.). */
  readonly tc: TranslateFn;

  /** Whether the section renders at all (Electron-only feature). */
  readonly isElectron: boolean;

  // --- Counts ---
  /** Number of tracks in the library that have at least one missing field. */
  readonly tracksNeedingCount: number;
  /** Whether there are any tracks needing enrichment (drives the stats copy). */
  readonly hasTracksNeeding: boolean;
  /** Number of needing-enrichment tracks the user previously skipped. */
  readonly skippedCount: number;
  /** Whether the skipped-count chip / include-skipped toggle should show. */
  readonly hasSkipped: boolean;

  // --- Run state ---
  /** Whether a bulk enrich run is currently in progress. */
  readonly isEnriching: boolean;
  /** Whether a cancellation request is in flight. */
  readonly isCancelling: boolean;
  /** Whether the inline write-to-file confirmation is showing. */
  readonly showConfirm: boolean;
  /** Whether the primary enrich button is disabled. */
  readonly enrichDisabled: boolean;

  // --- Option toggles ---
  /** "Only fill missing fields" toggle value. */
  readonly onlyMissing: boolean;
  /** Set the only-missing option. */
  readonly onOnlyMissingChange: (value: boolean) => void;
  /** "Include previously skipped" toggle value. */
  readonly includeSkipped: boolean;
  /** Set the include-skipped option. */
  readonly onIncludeSkippedChange: (value: boolean) => void;
  /** "Write tags to audio files" toggle value (irreversible; default off). */
  readonly writeToFile: boolean;
  /** Set the write-to-file option. */
  readonly onWriteToFileChange: (value: boolean) => void;

  // --- Actions ---
  /** Start the run (gates the destructive write path behind a confirm). */
  readonly onEnrich: () => void;
  /** Confirm and start the destructive (write-to-file) run. */
  readonly onConfirmedEnrich: () => void;
  /** Dismiss the inline write-to-file confirmation. */
  readonly onDismissConfirm: () => void;
  /** Cancel an in-progress run. */
  readonly onCancel: () => void;

  // --- Refs (focus management for the inline confirm) ---
  /** Ref on the primary enrich button (focus restore target on confirm dismiss). */
  readonly enrichButtonRef: RefObject<HTMLButtonElement | null>;
  /** Ref on the confirm's primary action (focused when the confirm opens). */
  readonly confirmYesRef: RefObject<HTMLButtonElement | null>;
}
