import { cn } from '@/lib/utils';
import { useVisualizerStyleGrid } from './VisualizerStyleGrid.hooks';
import type { IVisualizerStyleGridProps } from './VisualizerStyleGrid.types';

/**
 * Presentational visualizer style picker grid shared by Settings · Visualizer
 * and the first-run onboarding wizard so the two can never visually drift.
 * Keeps the aria-pressed a11y wiring intact.
 */
export default function VisualizerStyleGrid(props: IVisualizerStyleGridProps) {
  const { tiles, gridClassName, compact, onSelect } = useVisualizerStyleGrid(props);

  const tileButtons = tiles.map(tile => (
    <button
      key={tile.value}
      type="button"
      aria-pressed={tile.selected}
      onClick={() => onSelect(tile.value)}
      className={cn(
        'flex-1 rounded-xl border text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        tile.selected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/30 hover:border-border/50 hover:bg-accent/30'
      )}
    >
      <p
        className={cn(
          'text-sm font-medium',
          tile.selected ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {tile.label}
      </p>
      {!compact && <p className="text-xs text-muted-foreground/70 mt-0.5">{tile.description}</p>}
    </button>
  ));

  return <div className={gridClassName}>{tileButtons}</div>;
}
