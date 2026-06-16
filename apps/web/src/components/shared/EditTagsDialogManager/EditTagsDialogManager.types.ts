/** The detail payload of an `open-edit-tags-dialog` event. */
export interface IEditTagsRequest {
  readonly trackId: string;
}

export interface IEditTagsDialogManagerView {
  /** Whether the edit-tags dialog should be open. */
  readonly open: boolean;
  /** Controlled setter for the dialog's open state. */
  readonly setOpen: (open: boolean) => void;
  /** The active edit-tags request, or null before any event. */
  readonly request: IEditTagsRequest | null;
}
