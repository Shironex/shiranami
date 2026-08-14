import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_THEME } from '@/stores/useThemeStore';
import { THEME_TILES } from './ThemeTileGrid.constants';
import type { IThemeTileGridProps, IThemeTileGridView } from './ThemeTileGrid.types';

/**
 * Owns the theme-grid translator, the visible tile list, and the radiogroup
 * roving arrow-key navigation (the shell stays a thin, logic-free render).
 * Arrow Right/Down move forward, Left/Up move back, wrapping around the list.
 *
 * Navigation is computed against the *visible* list rather than the constant.
 * `findIndex` answers -1 for a tile that is not there, and `(-1 + delta + len) %
 * len` lands on index 0 — so an arrow keypress while a hidden tile was selected
 * would silently reset the theme to `none` instead of moving one step.
 */
export function useThemeTileGrid({
  value,
  onSelect,
  showCustom = true,
  customThumb,
}: IThemeTileGridProps): IThemeTileGridView {
  const { t } = useTranslation('settings');

  const tiles = useMemo(
    () =>
      THEME_TILES.filter(tile => showCustom || tile.id !== CUSTOM_THEME).map(tile =>
        tile.id === CUSTOM_THEME && customThumb ? { ...tile, thumb: customThumb } : tile
      ),
    [showCustom, customThumb]
  );

  // Falls back to the first tile when the selected theme is not on screen —
  // which happens whenever onboarding is replayed by someone whose theme is
  // `custom`. `findIndex` answers -1 there, and -1 is not merely a bad step:
  // used as the roving index it leaves *no* tile with `tabIndex={0}`, so the
  // whole radiogroup drops out of the tab order and the picker becomes
  // keyboard-unreachable.
  const found = tiles.findIndex(tile => tile.id === value);
  const activeIndex = found === -1 ? 0 : found;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowUp'
    )
      return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (activeIndex + delta + tiles.length) % tiles.length;
    onSelect(tiles[nextIndex].id);
  };

  return { t, tiles, activeIndex, onKeyDown };
}
