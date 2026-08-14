import { cn } from '@/lib/utils';
import { useHistoryHeroSection } from './HistoryHeroSection.hooks';
import type { IHistoryHeroSectionProps } from './HistoryHeroSection.types';

export default function HistoryHeroSection(props: IHistoryHeroSectionProps) {
  const { eyebrow, title, subtitle, ranges, onSelectRange } = useHistoryHeroSection(props);

  const rangePills = ranges.map(range => (
    <button
      key={range.id}
      type="button"
      onClick={() => onSelectRange(range.id)}
      className={cn(
        'focus-ring rounded-full border px-4 py-2 text-xs font-medium transition-colors',
        range.isActive
          ? 'border-primary/60 bg-primary/15 text-primary'
          : 'border-border/20 bg-background/30 text-muted-foreground hover:border-border/35 hover:text-foreground'
      )}
    >
      {range.label}
    </button>
  ));

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border/25 glass-panel p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(var(--primary-rgb),0.18),transparent_45%)]" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/55">
          {eyebrow}
        </p>
        <h1 className="mt-3 font-serif italic text-3xl leading-tight text-foreground">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground/75">{subtitle}</p>

        <div className="mt-5 flex flex-wrap gap-2">{rangePills}</div>
      </div>
    </section>
  );
}
