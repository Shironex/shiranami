import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AlbumData } from '@/lib/albumSort';

import AlbumCell from './AlbumCell';
import type { IAlbumCellProps } from './AlbumCell.types';

const ARIA_ATTRIBUTES = { 'aria-colindex': 1, role: 'gridcell' } as const;
const CELL_STYLE = { position: 'absolute', top: 0, left: 0, width: 200, height: 260 } as const;
const GAP_PX = 12;
const HALF_GAP_PX = '6px';
/** Opaque composite album identity — the cell only ever forwards it. */
const ALBUM_KEY = 'idealism--midnight-tapes';

function makeAlbum(overrides: Partial<AlbumData> = {}): AlbumData {
  return {
    key: ALBUM_KEY,
    name: 'Midnight Tapes',
    albumArtist: 'Idealism',
    artist: 'Idealism',
    year: 2019,
    createdAt: null,
    trackCount: 8,
    tracks: [],
    ...overrides,
  };
}

function makeCellProps(overrides: Partial<IAlbumCellProps> = {}): IAlbumCellProps {
  return {
    albums: [makeAlbum()],
    columnCount: 3,
    gap: GAP_PX,
    onAlbumClick: vi.fn(),
    cardPaddingClass: 'p-4',
    imgPx: 168,
    trackCountLabel: count => `${count} tracks`,
    ...overrides,
  };
}

function renderCell(
  position: { columnIndex: number; rowIndex: number },
  overrides: Partial<IAlbumCellProps> = {}
) {
  return render(
    <AlbumCell
      ariaAttributes={ARIA_ATTRIBUTES}
      columnIndex={position.columnIndex}
      rowIndex={position.rowIndex}
      style={CELL_STYLE}
      {...makeCellProps(overrides)}
    />
  );
}

describe('AlbumCell', () => {
  it('renders the album as one button carrying title, artist and track count', () => {
    renderCell({ columnIndex: 0, rowIndex: 0 });

    const card = screen.getByRole('button');
    expect(card).toHaveTextContent('Midnight Tapes');
    expect(card).toHaveTextContent('Idealism');
    expect(card).toHaveTextContent('8 tracks');
  });

  it('renders the aggregated multi-artist string verbatim', () => {
    renderCell(
      { columnIndex: 0, rowIndex: 0 },
      { albums: [makeAlbum({ artist: 'Alice, Bob, Carol', albumArtist: '' })] }
    );

    expect(screen.getByText('Alice, Bob, Carol')).toBeInTheDocument();
  });

  it('opens the album by its composite key when the card is clicked', async () => {
    const onAlbumClick = vi.fn();
    renderCell({ columnIndex: 0, rowIndex: 0 }, { onAlbumClick });

    await userEvent.click(screen.getByRole('button'));

    expect(onAlbumClick).toHaveBeenCalledTimes(1);
    expect(onAlbumClick).toHaveBeenCalledWith(ALBUM_KEY);
  });

  it('resolves the album from the flattened row/column index', () => {
    const albums = [
      makeAlbum({ key: 'a', name: 'A' }),
      makeAlbum({ key: 'b', name: 'B' }),
      makeAlbum({ key: 'c', name: 'C' }),
      makeAlbum({ key: 'd', name: 'D' }),
      makeAlbum({ key: 'e', name: 'E' }),
    ];
    renderCell({ columnIndex: 1, rowIndex: 1 }, { albums });

    expect(screen.getByRole('button')).toHaveTextContent('E');
  });

  it('renders an aria-hidden placeholder past the last album, with no button', () => {
    const { container } = renderCell({ columnIndex: 2, rowIndex: 0 });

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent).toBe('');
  });

  it('drops the outer-edge gap insets on the first column and first row', () => {
    const { container } = renderCell({ columnIndex: 0, rowIndex: 0 });

    const cell = container.firstElementChild as HTMLElement;
    expect(cell.style.paddingLeft).toBe('0px');
    expect(cell.style.paddingTop).toBe('0px');
    expect(cell.style.paddingRight).toBe(HALF_GAP_PX);
    expect(cell.style.paddingBottom).toBe(HALF_GAP_PX);
  });

  it('drops the right inset on the last column and insets interior rows', () => {
    const albums = Array.from({ length: 6 }, (_, index) =>
      makeAlbum({ key: `k${index}`, name: `Album ${index}` })
    );
    const { container } = renderCell({ columnIndex: 2, rowIndex: 1 }, { albums });

    const cell = container.firstElementChild as HTMLElement;
    expect(cell.style.paddingRight).toBe('0px');
    expect(cell.style.paddingLeft).toBe(HALF_GAP_PX);
    expect(cell.style.paddingTop).toBe(HALF_GAP_PX);
  });

  it("keeps react-window's positioning style on the cell wrapper", () => {
    const { container } = renderCell({ columnIndex: 0, rowIndex: 0 });

    const cell = container.firstElementChild as HTMLElement;
    expect(cell.style.position).toBe('absolute');
    expect(cell.style.width).toBe('200px');
    expect(cell.style.height).toBe('260px');
  });

  it('sizes the cover box to the measured square edge', () => {
    const { container } = renderCell({ columnIndex: 0, rowIndex: 0 }, { imgPx: 144 });

    const cover = container.querySelector('.rounded-xl') as HTMLElement;
    expect(cover.style.height).toBe('144px');
  });

  it('applies the grid-size padding class to the card', () => {
    renderCell({ columnIndex: 0, rowIndex: 0 }, { cardPaddingClass: 'p-3' });

    expect(screen.getByRole('button')).toHaveClass('p-3');
  });

  it('renders the cover image when the album has art', () => {
    renderCell(
      { columnIndex: 0, rowIndex: 0 },
      { albums: [makeAlbum({ albumArt: 'data:image/png;base64,abc' })] }
    );

    const cover = screen.getByRole('img', { name: 'Midnight Tapes' });
    expect(cover).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('falls back to the disc glyph when the album has no art', () => {
    const { container } = renderCell({ columnIndex: 0, rowIndex: 0 });

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
