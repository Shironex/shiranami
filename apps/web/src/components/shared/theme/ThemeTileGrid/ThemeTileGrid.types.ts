import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { useTranslation } from 'react-i18next';
import type { ThemeId } from '@/stores/useThemeStore';
import type { IThemeTile } from './ThemeTileGrid.constants';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IThemeTileGridProps {
  readonly value: ThemeId;
  readonly onSelect: (id: ThemeId) => void;
  /** Tailwind grid-column count (default 3, matching Settings · Appearance). */
  readonly columns?: 2 | 3;
  /**
   * Whether to offer the "your own image" tile. Default true.
   *
   * Onboarding passes false: selecting it opens a native file picker, and a
   * modal OS dialog in the middle of first-run is a different contract from the
   * same affordance in Settings, where the user came looking for it.
   */
  readonly showCustom?: boolean;
  /** URL of the imported image, for the custom tile's thumbnail. */
  readonly customThumb?: string | null;
}

export interface IThemeTileGridView {
  /** Bound `settings` namespace translator. */
  readonly t: TranslateFn;
  /**
   * The tiles to render, already filtered and with the custom thumb applied.
   *
   * The same list drives rendering *and* arrow-key navigation, which is the
   * point of returning it: navigating a list that differs from the rendered one
   * by even a single entry silently selects the wrong theme.
   */
  readonly tiles: readonly IThemeTile[];
  /**
   * Which tile holds `tabIndex={0}`. Equal to the selected tile's index, or 0
   * when the selection is not among the visible tiles — otherwise the group
   * would have no tab stop at all.
   */
  readonly activeIndex: number;
  /** Roving arrow-key navigation across the tiles (radiogroup pattern). */
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}
