import { DarkTheme, type Theme } from 'expo-router';
import generated from '@/theme/colors.json';
import { fontFamily } from '@/theme/fonts';

/**
 * Colors for props that take a value instead of a class (icon colors, SVG
 * fills, navigation). Same generated hex as the Tailwind theme.
 */
export const colors = {
  background: generated.colors.background,
  card: generated.colors.card,
  muted: generated.colors.muted,
  raised: generated.colors.raised,
  sheet: generated.colors.sheet,
  nav: generated.colors.nav,
  dock: generated.colors.dock,
  dockTab: generated.colors['dock-tab'],
  dockIcon: generated.colors['dock-icon'],
  foreground: generated.colors.foreground,
  softForeground: generated.colors['soft-foreground'],
  mutedForeground: generated.colors['muted-foreground'],
  primary: generated.colors.primary,
  primaryForeground: generated.colors['primary-foreground'],
  primaryTint: generated.colors['primary-tint'],
  border: generated.colors.border,
  borderStrong: generated.colors['border-strong'],
  rail: generated.colors.rail,
  favorite: generated.colors.favorite,
  live: generated.colors.live,
  destructive: generated.colors.destructive,
  playerGlow: generated.colors['player-glow'],
  playerMid: generated.colors['player-mid'],
  switchTrack: generated.colors['switch-track'],
  shade: generated.colors.shade,
  veil: generated.colors.veil,
  handle: generated.colors.handle,
} as const;

export const fonts = {
  body: fontFamily.body,
  bodyMedium: fontFamily['body-medium'],
  bodySemibold: fontFamily['body-semibold'],
  displayMedium: fontFamily['display-medium'],
  display: fontFamily.display,
  kanji: fontFamily.kanji,
} as const;

/** The desktop's ease-out curve, cubic-bezier(0.22, 1, 0.36, 1). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1): moves that should land softly, no bounce. */
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export const NAV_THEME: Theme = {
  ...DarkTheme,
  colors: {
    background: colors.background,
    border: colors.border,
    card: colors.card,
    notification: colors.destructive,
    primary: colors.primary,
    text: colors.foreground,
  },
};
