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
