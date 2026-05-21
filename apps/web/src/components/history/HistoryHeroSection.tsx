import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { HISTORY_RANGES, getRangeCopy, type HistoryRange } from './historyUtils';

type HistoryHeroSectionProps = {
  selectedRange: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
};

export function HistoryHeroSection({ selectedRange, onRangeChange }: HistoryHeroSectionProps) {
  const { t } = useTranslation('history');
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border/25 glass-panel p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(var(--primary-rgb),0.18),transparent_45%)]" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/55">
          {t('listeningHistory')}
        </p>
        <h1 className="mt-3 font-serif italic text-3xl leading-tight text-foreground">
          {t('heroTitle')}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground/75">
          {t('heroSubtitle', { range: getRangeCopy(selectedRange).toLowerCase() })}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {HISTORY_RANGES.map(range => (
            <button
              key={range.id}
              type="button"
              onClick={() => onRangeChange(range.id)}
              className={cn(
                'rounded-full border px-4 py-2 text-xs font-medium transition-colors',
                selectedRange === range.id
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-border/20 bg-background/30 text-muted-foreground hover:border-border/35 hover:text-foreground'
              )}
            >
              {t(range.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
