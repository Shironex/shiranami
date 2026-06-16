/** The detail payload of an `open-share-dialog` event. */
export interface IShareRequest {
  readonly type: 'track' | 'playlist';
  readonly id: string;
}

export interface IShareDialogManagerView {
  /** Whether the share dialog should be open. */
  readonly shareOpen: boolean;
  /** Controlled setter for the share dialog's open state. */
  readonly setShareOpen: (open: boolean) => void;
  /** The active share request (track/playlist + id), or null before any event. */
  readonly shareRequest: IShareRequest | null;
  /** The deep-link import code, or empty string when there is none. */
  readonly importCode: string;
  /** Whether the import dialog should be open. */
  readonly importOpen: boolean;
  /** Controlled setter for the import dialog's open state. */
  readonly setImportOpen: (open: boolean) => void;
}
