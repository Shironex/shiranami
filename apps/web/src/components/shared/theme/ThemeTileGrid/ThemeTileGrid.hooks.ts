import { useTranslation } from 'react-i18next';
import { THEME_TILES } from './ThemeTileGrid.constants';
import type { IThemeTileGridProps, IThemeTileGridView } from './ThemeTileGrid.types';

/**
 * Owns the theme-grid translator and the radiogroup roving arrow-key navigation
 * (the shell stays a thin, logic-free render). Arrow Right/Down move forward,
 * Left/Up move back, wrapping around the tile list.
 */
export function useThemeTileGrid({ value, onSelect }: IThemeTileGridProps): IThemeTileGridView {
  const { t } = useTranslation('settings');

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowUp'
    )
      return;
    e.preventDefault();
    const currentIndex = THEME_TILES.findIndex(tile => tile.id === value);
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + THEME_TILES.length) % THEME_TILES.length;
    onSelect(THEME_TILES[nextIndex].id);
  };

  return { t, onKeyDown };
}
