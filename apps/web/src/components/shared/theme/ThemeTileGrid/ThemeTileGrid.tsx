import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThemeId } from '@/stores/useThemeStore';
import { useThemeTileGrid } from './ThemeTileGrid.hooks';
import type { IThemeTileGridProps } from './ThemeTileGrid.types';

// Drives the theme picker grid. `thumb` reuses the same committed WebP the
// background uses, downscaled by CSS object-fit. The "none" tile has no thumb
// and renders a solid swatch so the default reads as "no photo".
export const THEME_TILES: Array<{ id: ThemeId; nameKey: string; thumb?: string }> = [
  { id: 'none', nameKey: 'none' },
  { id: 'lofi-night', nameKey: 'lofiNight', thumb: './themes/lofi-night.webp' },
  { id: 'snow', nameKey: 'snow', thumb: './themes/snow.webp' },
  { id: 'summer', nameKey: 'summer', thumb: './themes/summer.webp' },
  { id: 'sunset', nameKey: 'sunset', thumb: './themes/sunset.webp' },
  { id: 'wisteria', nameKey: 'wisteria', thumb: './themes/wisteria.webp' },
];

/**
 * Presentational theme picker grid shared by Settings · Appearance and the
 * first-run onboarding wizard so the two can never visually drift. Keeps the
 * radiogroup/radio/aria-checked a11y wiring intact.
 */
export default function ThemeTileGrid(props: IThemeTileGridProps) {
  const { value, onSelect, columns = 3 } = props;
  const { t, onKeyDown } = useThemeTileGrid(props);

  const tiles = THEME_TILES.map(tile => {
    const isActive = value === tile.id;
    const name = t(`app.theme.names.${tile.nameKey}`);
    return (
      <button
        key={tile.id}
        type="button"
        role="radio"
        aria-checked={isActive}
        aria-label={t('app.theme.apply', { name })}
        tabIndex={isActive ? 0 : -1}
        onClick={() => onSelect(tile.id)}
        className={cn(
          'group relative aspect-video rounded-xl overflow-hidden border text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive
            ? 'border-primary/60 ring-1 ring-primary/40 shadow-[0_0_18px_-4px_rgba(var(--primary-rgb),0.5)]'
            : 'border-border/40 hover:border-border/60'
        )}
      >
        {tile.thumb ? (
          <img
            src={tile.thumb}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-background" />
        )}
        <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {name}
        </span>
        {isActive && (
          <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-primary text-primary-foreground shadow">
            <Check className="w-3 h-3" />
          </span>
        )}
      </button>
    );
  });

  return (
    <div
      role="radiogroup"
      aria-label={t('app.theme.title')}
      onKeyDown={onKeyDown}
      className={cn('grid gap-2.5', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}
    >
      {tiles}
    </div>
  );
}
