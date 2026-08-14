import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ThemeTileGrid from './ThemeTileGrid';
import { THEME_TILES } from './ThemeTileGrid.constants';

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

  it('hides the custom tile when asked, for onboarding', () => {
    render(<ThemeTileGrid value="none" onSelect={vi.fn()} showCustom={false} />);

    expect(screen.getAllByRole('radio')).toHaveLength(THEME_TILES.length - 1);
  });

  /**
   * The trap this guards. Arrow navigation is index-based, and `findIndex`
   * answers -1 for a tile that is not rendered — `(-1 + 1 + len) % len` is 0,
   * so an arrow keypress would silently jump to the *first* tile instead of
   * moving one step. Navigating the visible list rather than the constant is
   * what makes the step honest.
   */
  it('steps from the last visible tile when the custom tile is hidden', () => {
    const onSelect = vi.fn();
    const visible = THEME_TILES.filter(tile => tile.id !== 'custom');
    const last = visible[visible.length - 1].id;
    render(<ThemeTileGrid value={last} onSelect={onSelect} showCustom={false} />);

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(onSelect).toHaveBeenCalledWith(visible[0].id);
    expect(onSelect).not.toHaveBeenCalledWith('custom');
  });

  it('uses the imported image as the custom tile thumbnail', () => {
    render(
      <ThemeTileGrid value="custom" onSelect={vi.fn()} customThumb="http://127.0.0.1:1/t/bg.png" />
    );

    const custom = screen.getAllByRole('radio')[THEME_TILES.length - 1];
    expect(custom.querySelector('img')).toHaveAttribute('src', 'http://127.0.0.1:1/t/bg.png');
  });
});
