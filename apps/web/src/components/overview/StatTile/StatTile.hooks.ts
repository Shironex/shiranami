import type { IStatTileProps, IStatTileView, StatTrendDirection } from './StatTile.types';

function hintClassFor(trend: StatTrendDirection): string {
  if (trend === 'up') return 'text-success/90';
  if (trend === 'down') return 'text-muted-foreground/70';
  return 'text-muted-foreground/55';
}

export function useStatTile({ hint, trend = 'neutral' }: IStatTileProps): IStatTileView {
  return {
    showHint: hint !== undefined && hint !== null,
    hintClass: hintClassFor(trend),
  };
}
