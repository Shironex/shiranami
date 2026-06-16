import type { useTranslation } from 'react-i18next';
import type { EnrichUpdatedFields } from '@/stores/useMetadataEnrichStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** The dialog's internal state machine across the enrich lookup lifecycle. */
export type TrackEnrichDialogState =
  | { kind: 'searching' }
  | {
      kind: 'found';
      updatedFields: EnrichUpdatedFields;
      source: string;
      confidence?: number;
      coverArt?: string;
    }
  | { kind: 'no-match' }
  | { kind: 'applied' }
  | { kind: 'error'; message: string };

/** A single proposed-change row: the current value vs. the matched value. */
export interface IEnrichFieldRow {
  readonly key: keyof EnrichUpdatedFields;
  readonly current: unknown;
  readonly proposed: unknown;
}

export interface ITrackEnrichDialogProps {
  /** Whether the enrich dialog is open. */
  readonly open: boolean;
  /** Open-state controller (Radix `onOpenChange`). */
  readonly onOpenChange: (open: boolean) => void;
  /** The id of the track to look up metadata for. */
  readonly trackId: string;
}

export interface ITrackEnrichDialogView {
  /** Bound `enrichDialog` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether a track was resolved from the library (else the dialog renders nothing). */
  readonly hasTrack: boolean;
  /** The resolved track's title (empty when no track). */
  readonly trackTitle: string;
  /** The resolved track's artist (empty when no track). */
  readonly trackArtist: string;
  /** The resolved track's album-art data URL / path, if any. */
  readonly trackAlbumArt: string | undefined;
  /** The current state-machine phase. */
  readonly state: TrackEnrichDialogState;
  /** The proposed-change rows shown in the `found` state. */
  readonly fieldRows: readonly IEnrichFieldRow[];
  /** Whether to also write the tags back to the audio file on apply. */
  readonly writeToFile: boolean;
  /** Toggle the write-to-file switch. */
  readonly setWriteToFile: (value: boolean) => void;
  /** Whether an apply is in flight (disables the actions). */
  readonly applying: boolean;
  /** (Re)run the metadata lookup — also drives the retry button. */
  readonly runPreview: () => void;
  /** Apply the matched fields (and optionally write to file). */
  readonly handleApply: () => void;
  /** Close the dialog. */
  readonly handleClose: () => void;
}
