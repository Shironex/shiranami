import type { ISettingsCardProps, ISettingsCardTone } from './SettingsCard.types';

const TONE_TILE: Record<ISettingsCardTone, { bg: string; icon: string }> = {
  default: { bg: 'bg-primary/10', icon: 'text-primary' },
  destructive: { bg: 'bg-destructive/15', icon: 'text-destructive' },
  warning: { bg: 'bg-amber-500/15', icon: 'text-amber-500' },
  info: { bg: 'bg-sky-500/15', icon: 'text-sky-500' },
};

const TONE_SURFACE: Record<ISettingsCardTone, string> = {
  default: 'bg-surface/50 border-border/30',
  destructive: 'border-destructive/25 bg-destructive/[0.06]',
  warning: 'border-amber-500/25 bg-amber-500/[0.05]',
  info: 'border-sky-500/25 bg-sky-500/[0.04]',
};

const TONE_TITLE: Record<ISettingsCardTone, string> = {
  default: 'text-foreground',
  destructive: 'text-destructive',
  warning: 'text-foreground',
  info: 'text-foreground',
};

export interface ISettingsCardView {
  /** Resolved background + icon tint classes for the icon tile. */
  readonly tile: { readonly bg: string; readonly icon: string };
  /** Resolved surface (border + background) classes for the card. */
  readonly surfaceClass: string;
  /** Resolved title text-color class. */
  readonly titleClass: string;
}

/** Resolves tone-driven styling for the SettingsCard shell. */
export function useSettingsCard(tone: ISettingsCardProps['tone'] = 'default'): ISettingsCardView {
  return {
    tile: TONE_TILE[tone],
    surfaceClass: TONE_SURFACE[tone],
    titleClass: TONE_TITLE[tone],
  };
}
