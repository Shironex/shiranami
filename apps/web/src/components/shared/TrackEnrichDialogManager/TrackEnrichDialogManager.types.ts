/** The detail payload of an `open-track-enrich-dialog` event. */
export interface ITrackEnrichRequest {
  readonly trackId: string;
}

export interface ITrackEnrichDialogManagerView {
  /** Whether the enrich dialog should be open. */
  readonly open: boolean;
  /** Controlled setter for the dialog's open state. */
  readonly setOpen: (open: boolean) => void;
  /** The active enrich request, or null before any event. */
  readonly request: ITrackEnrichRequest | null;
}
