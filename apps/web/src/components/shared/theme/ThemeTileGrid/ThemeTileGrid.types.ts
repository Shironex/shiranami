import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { useTranslation } from 'react-i18next';
import type { ThemeId } from '@/stores/useThemeStore';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IThemeTileGridProps {
  readonly value: ThemeId;
  readonly onSelect: (id: ThemeId) => void;
  /** Tailwind grid-column count (default 3, matching Settings · Appearance). */
  readonly columns?: 2 | 3;
}

export interface IThemeTileGridView {
  /** Bound `settings` namespace translator. */
  readonly t: TranslateFn;
  /** Roving arrow-key navigation across the tiles (radiogroup pattern). */
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}
