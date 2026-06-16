import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ThemeTileGrid, { THEME_TILES } from './ThemeTileGrid';

describe('ThemeTileGrid', () => {
  it('renders a radiogroup with a radio per theme tile and marks the active one', () => {
    render(<ThemeTileGrid value="lofi-night" onSelect={vi.fn()} />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(THEME_TILES.length);

    const checked = radios.filter(r => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
  });

  it('selects a tile on click', () => {
    const onSelect = vi.fn();
    render(<ThemeTileGrid value="none" onSelect={onSelect} />);

    fireEvent.click(screen.getAllByRole('radio')[1]);

    expect(onSelect).toHaveBeenCalledWith(THEME_TILES[1].id);
  });

  it('moves selection forward with ArrowRight, wrapping around', () => {
    const onSelect = vi.fn();
    const last = THEME_TILES[THEME_TILES.length - 1].id;
    render(<ThemeTileGrid value={last} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(onSelect).toHaveBeenCalledWith(THEME_TILES[0].id);
  });
});
