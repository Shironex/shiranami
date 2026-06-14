import type { SearchResult } from '@/types/electron';
import type { DownloadState } from '@/hooks/useSearch';

export interface ISearchResultRowProps {
  readonly result: SearchResult;
  readonly downloadState: DownloadState;
  readonly previewLoadingId: string | null;
  readonly isPreviewPlaying: (result: SearchResult) => boolean;
  readonly onPreview: (result: SearchResult) => void;
  readonly onDownload: (result: SearchResult) => void;
}

export interface ISearchResultRowView {
  /** True while the row's download is downloading or converting. */
  readonly isDownloading: boolean;
  /** True once the row's track has been added to the library. */
  readonly isDone: boolean;
  /** True when the row's download failed. */
  readonly isError: boolean;
  /** This row's preview is the active (playing) preview. */
  readonly isPreviewActive: boolean;
  /** This row's preview is still loading its stream. */
  readonly isPreviewLoading: boolean;
  /** Render the artwork thumbnail (a URL is present); else the Music icon. */
  readonly showThumbnail: boolean;
  /** Localized label/title for the preview toggle button. */
  readonly previewLabel: string;
  /** Localized status subtitle for downloading state. */
  readonly downloadingLabel: string;
  /** Localized status subtitle for the added-to-library state. */
  readonly addedLabel: string;
  /** Localized status subtitle for the error state. */
  readonly errorLabel: string;
  /** Localized aria-label for the download/progress button. */
  readonly downloadAriaLabel: string;
  /** Tooltip for the download button — retry copy on error, else undefined. */
  readonly downloadTitle: string | undefined;
  /** Render the abbreviated "· N views" suffix on the meta line. */
  readonly showViewCount: boolean;
  /** Localized "· N views" suffix (empty string when not shown). */
  readonly viewCountLabel: string;
  /** Localized track duration (mm:ss). */
  readonly durationLabel: string;
  /** Localized aria-label for the determinate progress bar. */
  readonly progressAriaLabel: string;
  /** Idle button is hover-revealed; active/done/error stay visible. */
  readonly downloadButtonClassName: string | undefined;
  /** Toggle this row's preview playback. */
  readonly onPreviewClick: () => void;
  /** Trigger (or retry) this row's download. */
  readonly onDownloadClick: () => void;
}
