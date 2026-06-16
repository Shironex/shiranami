import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';
import type { AppView } from '@/stores/useViewStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ICommandPaletteView {
  /** Bound `commandPalette` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the palette dialog is open. */
  readonly open: boolean;
  /** Controls the palette dialog open state. */
  readonly setOpen: (open: boolean) => void;
  /** The full library — mapped into track rows while open, empty while closed. */
  readonly tracks: readonly Track[];
  /** The currently-playing track id, for the inline "playing" marker. */
  readonly currentTrackId: string | undefined;
  /** Whether the library has any tracks (gates the Tracks group). */
  readonly hasTracks: boolean;
  /** Queue and play a track from the library, then close the palette. */
  readonly onPlayTrack: (track: Track) => void;
  /** Navigate to a view, then close the palette. */
  readonly onNavigate: (view: AppView) => void;
}
