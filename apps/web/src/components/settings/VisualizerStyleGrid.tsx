import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { VisualizerStyle } from '@/stores/useUIStore';
import { VISUALIZER_STYLES } from '@/components/player/visualizerRegistry';

interface VisualizerStyleGridProps {
  value: VisualizerStyle;
  onSelect: (style: VisualizerStyle) => void;
  /** Tailwind grid-column count (default 2, matching Settings · Visualizer). */
  columns?: 2 | 3;
  /** Condensed variant — drops the per-style description line. */
  compact?: boolean;
}

/**
 * Presentational visualizer style picker grid shared by Settings · Visualizer
 * and the first-run onboarding wizard so the two can never visually drift.
 * Keeps the aria-pressed a11y wiring intact.
 */
export function VisualizerStyleGrid({
  value,
  onSelect,
  columns = 2,
  compact = false,
}: VisualizerStyleGridProps) {
  const { t } = useTranslation('settings');

  return (
    <div className={cn('grid gap-3', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {VISUALIZER_STYLES.map(opt => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(opt.value)}
            className={cn(
              'flex-1 rounded-xl border text-left transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              compact ? 'px-3 py-2' : 'px-4 py-3',
              selected
                ? 'border-primary/40 bg-primary/10'
                : 'border-border/30 hover:border-border/50 hover:bg-accent/30'
            )}
          >
            <p
              className={cn(
                'text-sm font-medium',
                selected ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {t(opt.labelKey)}
            </p>
            {!compact && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{t(opt.descKey)}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
