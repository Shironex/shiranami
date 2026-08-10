import type { useTranslation } from 'react-i18next';
import type { LyricsFontSize, LyricsPresentation } from '@/stores/useLyricsAppearanceStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ILyricsSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Localized "reset" label (from the `common` namespace). */
  readonly resetLabel: string;

  // --- Sources ---
  /** When true, LRCLIB synced lyrics outrank local plain-text files. */
  readonly preferSyncedFromLrclib: boolean;
  /** True until the persisted value has seeded (or outside Electron). */
  readonly preferSyncedDisabled: boolean;
  /** Persist the source-precedence toggle and re-resolve current lyrics. */
  readonly onSetPreferSyncedFromLrclib: (value: boolean) => void;

  // --- Write-back ---
  /**
   * When true, a synced hit from LRCLIB is saved as a `.lrc` beside the track.
   * Off unless the user has said otherwise: this is the one setting that makes
   * the app write into their music folders.
   */
  readonly saveFetchedLyrics: boolean;
  /** True until the persisted value has seeded (or outside Electron). */
  readonly saveFetchedDisabled: boolean;
  /** Persist the write-back opt-in. */
  readonly onSetSaveFetchedLyrics: (value: boolean) => void;
  /** Whether a library-wide write-back run is going. */
  readonly saveRunning: boolean;
  /** Whether the run button is inert — the opt-in is off, or a run is queued. */
  readonly saveRunDisabled: boolean;
  /** Localized progress line while a run is going; `null` otherwise. */
  readonly saveProgressLabel: string | null;
  /** Localized counts from the last finished run; `null` before one. */
  readonly saveSummaryLabel: string | null;
  /** Localized note explaining why the run button is inert; `null` when it is not. */
  readonly saveDisabledHint: string | null;
  /** Start a library-wide write-back run. */
  readonly onRunSave: () => void;
  /** Stop the active run. */
  readonly onCancelSave: () => void;

  // --- Plain lyrics ---
  /** Plain-lyrics text opacity (0–1). */
  readonly lyricsPlainOpacity: number;
  /** Plain-lyrics font size. */
  readonly lyricsPlainFontSize: LyricsFontSize;
  /** Set the plain-lyrics opacity. */
  readonly onSetPlainOpacity: (value: number) => void;
  /** Set the plain-lyrics font size. */
  readonly onSetPlainFontSize: (size: LyricsFontSize) => void;
  /** Min/max/step for the plain-opacity slider. */
  readonly plainOpacityMin: number;
  readonly plainOpacityMax: number;
  readonly plainOpacityStep: number;

  // --- Synced lyrics ---
  /** Synced-lyrics dimmed-line opacity (0–1). */
  readonly lyricsSyncedDimOpacity: number;
  /** Synced-lyrics font size. */
  readonly lyricsSyncedFontSize: LyricsFontSize;
  /** Set the synced-lyrics dim opacity. */
  readonly onSetSyncedDimOpacity: (value: number) => void;
  /** Set the synced-lyrics font size. */
  readonly onSetSyncedFontSize: (size: LyricsFontSize) => void;
  /** Min/max/step for the synced dim-opacity slider. */
  readonly syncedDimOpacityMin: number;
  readonly syncedDimOpacityMax: number;
  readonly syncedDimOpacityStep: number;
  /** How synced lyrics present: the classic list or the focus stage. */
  readonly lyricsPresentation: LyricsPresentation;
  /** Set the synced-lyrics presentation. */
  readonly onSetPresentation: (presentation: LyricsPresentation) => void;
  /**
   * Localized note that the focus stage lives in the Now Playing view, shown
   * when Focus is selected while that view is disabled; `null` otherwise.
   */
  readonly presentationHint: string | null;

  // --- Reset ---
  /** Whether any lyrics preference differs from default (shows the reset link). */
  readonly isModified: boolean;
  /** Reset the lyrics appearance preferences. */
  readonly onReset: () => void;
}
