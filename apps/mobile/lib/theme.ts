import { DarkTheme, type Theme } from '@react-navigation/native';

export const colors = {
  background: 'hsl(265 25% 8%)',
  foreground: 'hsl(265 10% 93%)',
  card: 'hsl(265 17% 12%)',
  cardForeground: 'hsl(265 10% 93%)',
  primary: 'hsl(265 50% 72%)',
  primaryForeground: 'hsl(265 25% 10%)',
  muted: 'hsl(265 15% 15%)',
  mutedForeground: 'hsl(265 10% 55%)',
  border: 'hsl(265 10% 18%)',
  destructive: 'hsl(0 70% 60%)',
  favorite: 'hsl(15 65% 60%)',
};

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
