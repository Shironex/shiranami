import type { CSSProperties } from 'react';
import type { CellComponentProps } from 'react-window';
import type { IAlbumCellProps, IAlbumCellView } from './AlbumCell.types';

/** Stable no-op for the empty trailing cells, which have no album to open. */
const NO_SELECTION = (): void => {};

/** Empty cells render no card, so they carry no track-count copy. */
const NO_TRACK_COUNT_LABEL = '';

/**
 * AlbumCell sits on the grid's hottest render path, so this stays a plain
 * function with no React hooks and no store reads: it flattens the row/column
 * index into the album list, folds the half-gap edge insets into react-window's
 * positioned `style`, and binds the album key into `onSelect`.
 */
export function useAlbumCell({
  columnIndex,
  rowIndex,
  style,
  albums,
  columnCount,
  gap,
  onAlbumClick,
  cardPaddingClass,
  imgPx,
  trackCountLabel: formatTrackCount,
}: CellComponentProps<IAlbumCellProps>): IAlbumCellView {
  const halfGap = gap / 2;
  const insetStyle: CSSProperties = {
    ...style,
    paddingLeft: columnIndex === 0 ? 0 : halfGap,
    paddingRight: columnIndex === columnCount - 1 ? 0 : halfGap,
    paddingTop: rowIndex === 0 ? 0 : halfGap,
    paddingBottom: halfGap,
  };

  const album = albums[rowIndex * columnCount + columnIndex] ?? null;

  if (album === null) {
    return {
      album: null,
      insetStyle,
      cardPaddingClass,
      imgPx,
      trackCountLabel: NO_TRACK_COUNT_LABEL,
      onSelect: NO_SELECTION,
    };
  }

  return {
    album,
    insetStyle,
    cardPaddingClass,
    imgPx,
    trackCountLabel: formatTrackCount(album.trackCount),
    onSelect: () => onAlbumClick(album.key),
  };
}
