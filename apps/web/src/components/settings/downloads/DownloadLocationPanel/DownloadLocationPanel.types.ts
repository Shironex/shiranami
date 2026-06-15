export interface IDownloadLocationPanelProps {
  /** The download path to display (custom path or default fallback). */
  readonly pathDisplay: string;
  /** Whether the current location is the default one. */
  readonly isDefault: boolean;
  /** Whether a location change/reset is in flight (disables the buttons). */
  readonly updating: boolean;
  /** Open the directory picker to change the location. */
  readonly onChange: () => void;
  /** Reset the location back to the default. */
  readonly onReset: () => void;
}

export interface IDownloadLocationPanelView {
  /** The download path to display. */
  readonly pathDisplay: string;
  /** Whether the current location is the default one. */
  readonly isDefault: boolean;
  /** Whether a location change/reset is in flight. */
  readonly updating: boolean;
  /** Open the directory picker to change the location. */
  readonly onChange: () => void;
  /** Reset the location back to the default. */
  readonly onReset: () => void;
  /** Localized "Location" label. */
  readonly locationLabel: string;
  /** Localized default/custom badge text (depends on `isDefault`). */
  readonly originBadge: string;
  /** Localized hint shown beneath the path. */
  readonly locationHint: string;
  /** Localized "Change location" button label. */
  readonly changeLabel: string;
  /** Localized "Reset to default" button label. */
  readonly resetLabel: string;
}
