import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** The editable tag form, mirroring the writable ID3/Vorbis fields. */
export interface IEditTagsFormState {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  genre: string;
  year: string;
  trackNumber: string;
  discNumber: string;
}

/** A labelled field descriptor used to render the form rows. */
export interface IEditTagsField {
  readonly key: keyof IEditTagsFormState;
  readonly label: string;
}

export interface IEditTagsDialogProps {
  /** Whether the edit-tags dialog is open. */
  readonly open: boolean;
  /** Open-state controller (Radix `onOpenChange`). */
  readonly onOpenChange: (open: boolean) => void;
  /** The id of the track being edited. */
  readonly trackId: string;
}

export interface IEditTagsDialogView {
  /** Bound `editTags` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the dialog has a resolved track + seeded form to render. */
  readonly ready: boolean;
  /** The current form values (null until seeded). */
  readonly form: IEditTagsFormState | null;
  /** Whether a save is in flight (disables inputs + actions). */
  readonly saving: boolean;
  /** The free-text field descriptors (title, artist, album, etc.). */
  readonly textFields: readonly IEditTagsField[];
  /** The numeric field descriptors (year, track #, disc #). */
  readonly numberFields: readonly IEditTagsField[];
  /** Update a single form field. */
  readonly setField: (key: keyof IEditTagsFormState, value: string) => void;
  /** Persist the tags to the file + library store. */
  readonly handleSave: () => void;
  /** Close the dialog. */
  readonly onClose: () => void;
}
