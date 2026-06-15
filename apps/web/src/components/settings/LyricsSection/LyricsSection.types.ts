import type { useTranslation } from 'react-i18next';
import type { LyricsFontSize } from '@/stores/useLyricsAppearanceStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ILyricsSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Localized "reset" label (from the `common` namespace). */
  readonly resetLabel: string;

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

  // --- Reset ---
  /** Whether any lyrics preference differs from default (shows the reset link). */
  readonly isModified: boolean;
  /** Reset all four lyrics appearance preferences. */
  readonly onReset: () => void;
}
