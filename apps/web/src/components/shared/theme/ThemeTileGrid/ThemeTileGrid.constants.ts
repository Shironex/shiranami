import type { ThemeId } from '@/stores/useThemeStore';

// Drives the theme picker grid. `thumb` reuses the same committed WebP the
// background uses, downscaled by CSS object-fit. The "none" tile has no thumb
// and renders a solid swatch so the default reads as "no photo". Lives in its
// own module (not the shell) so the shell and its hook can both read it without
// a circular `<shell> -> .hooks -> <shell>` import edge.
export const THEME_TILES: Array<{ id: ThemeId; nameKey: string; thumb?: string }> = [
  { id: 'none', nameKey: 'none' },
  { id: 'lofi-night', nameKey: 'lofiNight', thumb: './themes/lofi-night.webp' },
  { id: 'snow', nameKey: 'snow', thumb: './themes/snow.webp' },
  { id: 'summer', nameKey: 'summer', thumb: './themes/summer.webp' },
  { id: 'sunset', nameKey: 'sunset', thumb: './themes/sunset.webp' },
  { id: 'wisteria', nameKey: 'wisteria', thumb: './themes/wisteria.webp' },
];
