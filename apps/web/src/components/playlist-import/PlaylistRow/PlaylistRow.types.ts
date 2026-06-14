import type { CSSProperties } from 'react';
import type { DownloadStatus } from '@/components/shared/DownloadProgressButton';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

/**
 * Per-row props passed to every virtualized row via react-window's `rowProps`.
 * The shell receives these merged with react-window's `index` + `style` as
 * `RowComponentProps<IPlaylistRowProps>`.
 */
export interface IPlaylistRowProps {
  readonly tracks: PlaylistTrack[];
  readonly isImporting: boolean;
  readonly previewLoadingId: string | null;
  readonly isPreviewPlaying: (result: { id: string }) => boolean;
  readonly handlePreview: (result: PlaylistTrack['searchResult']) => void;
  readonly handleRemoveTrack: (id: string) => void;
  readonly handleDownloadTrack: (id: string) => void;
}

export interface IPlaylistRowView {
  /** The track this row renders, or null when the index is out of range. */
  readonly track: PlaylistTrack | null;
  /** Inline style react-window assigns for absolute positioning. */
  readonly style: CSSProperties | undefined;
  /** 1-based display index for the row number column. */
  readonly displayIndex: number;
  /** Whether this row is in the current multi-select set. */
  readonly isSelected: boolean;
  /** Downloading or converting — drives the active row background + progress bar. */
  readonly isActive: boolean;
  /** Mapped status for the shared download-status glyph button. */
  readonly downloadStatus: DownloadStatus;
  /** Localized label for the current track status. */
  readonly statusLabel: string;
  /** Tailwind class for the status badge color, derived from the status. */
  readonly statusBadgeClass: string;
  /** Trailing ": <error>" appended to the status badge when the track failed. */
  readonly errorSuffix: string;
  /** Whether to show the status badge (non-pending tracks). */
  readonly showStatusBadge: boolean;
  /** Whether to flag the result as a low-confidence match. */
  readonly isLowConfidence: boolean;
  /** Whether the preview overlay should render as playing for this row. */
  readonly isPreviewing: boolean;
  /** Whether the preview is loading its stream for this row. */
  readonly isPreviewLoading: boolean;
  /** Aria-label / title for the download-status glyph button. */
  readonly downloadButtonLabel: string;
  /** Tooltip for the download-status glyph button — the raw error on failure. */
  readonly downloadButtonTitle: string | undefined;
  /** Whether the download-status glyph button is disabled. */
  readonly downloadButtonDisabled: boolean;
  /** Whether the inline remove button renders (pending + not importing). */
  readonly canRemove: boolean;
  /** Tooltip + aria-label for the remove button. */
  readonly removeLabel: string;
  /** Localized hint shown next to a low-confidence match badge. */
  readonly lowConfidenceHint: string;
  /** Localized low-confidence badge label. */
  readonly lowConfidenceLabel: string;
  /** Accessible label for the determinate download progress bar. */
  readonly progressAriaLabel: string;
  /** Row-level click handler (mod/shift select, clear, or preview). */
  readonly onRowClick: (event: React.MouseEvent) => void;
  /** Thumbnail click handler (toggle select or preview). */
  readonly onThumbnailClick: (event: React.MouseEvent) => void;
  /** Remove this track from the list. */
  readonly onRemove: () => void;
  /** Start (or retry) the download for this track. */
  readonly onDownload: () => void;
}
