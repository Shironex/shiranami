import { useTranslation } from 'react-i18next';
import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatPeakWindow,
  getWeekdayShortNames,
  type HeatLevel,
  type HeatmapModel,
} from '@/components/overview/overviewUtils';

interface ListeningClockProps {
  heatmap: HeatmapModel;
}

/** Hour ticks shown above the grid. */
const HOUR_TICKS = ['00', '06', '12', '18', '24'];

/** Per-level background — all derived from `--primary` so every theme re-tints. */
const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: 'bg-foreground/5',
  1: 'bg-primary/25',
  2: 'bg-primary/45',
  3: 'bg-primary/65',
  4: 'bg-primary/90',
};

export function ListeningClock({ heatmap }: ListeningClockProps) {
  const { t, i18n } = useTranslation('overview');
  const days = getWeekdayShortNames(i18n.language);

  return (
    <section className="flex flex-col rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-primary/80" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            {t('listeningClock', { em: t('listeningClockEm') })}
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
          {t('last7Days')}
        </span>
      </div>

      {!heatmap.hasData ? (
        <p className="mt-6 rounded-2xl border border-border/20 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground/60">
          {t('heatmap.empty')}
        </p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto scrollbar-thin pb-1">
            <div className="min-w-[20rem]">
              {/* Hour ticks */}
              <div className="ml-9 flex justify-between font-mono text-[9px] text-muted-foreground/45">
                {HOUR_TICKS.map(tick => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>

              <div
                className="mt-1.5 flex flex-col gap-1"
                role="img"
                aria-label={t('heatmap.ariaLabel', { total: heatmap.totalPlays })}
              >
                {heatmap.cells.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex items-center gap-1">
                    <span className="w-8 shrink-0 font-mono text-[9px] uppercase text-muted-foreground/50">
                      {days[rowIndex]}
                    </span>
                    <div className="flex flex-1 gap-[3px]">
                      {row.map(cell => (
                        <span
                          key={cell.hour}
                          className={cn(
                            'h-3.5 flex-1 rounded-[3px]',
                            LEVEL_CLASS[cell.level],
                            // Non-color cue: a faint ring on the busiest cells so
                            // intensity is not conveyed by shade alone.
                            cell.level >= 3 && 'ring-1 ring-inset ring-primary/40'
                          )}
                          title={t('heatmap.cellLabel', {
                            day: days[rowIndex],
                            hour: `${String(cell.hour).padStart(2, '0')}:00`,
                            level: t(`heatmap.level.${cell.level}`),
                            count: cell.playCount,
                          })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/55">
            <span className="font-mono uppercase tracking-wider">{t('heatmap.legendQuiet')}</span>
            {([0, 1, 2, 3, 4] as HeatLevel[]).map(level => (
              <span
                key={level}
                aria-hidden="true"
                className={cn('size-3 rounded-[3px]', LEVEL_CLASS[level])}
              />
            ))}
            <span className="font-mono uppercase tracking-wider">{t('heatmap.legendLoud')}</span>
            <span className="ml-auto truncate text-muted-foreground/65">
              {heatmap.peakHour !== null
                ? t('heatmap.loudest', { range: formatPeakWindow(heatmap.peakHour) })
                : t('heatmap.loudestNone')}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
