import { useStatsSection } from './StatsSection.hooks';
import type { IStatsSectionProps } from './StatsSection.types';

export default function StatsSection(props: IStatsSectionProps) {
  const { headingId, title, Icon, caption, isHero, children } = useStatsSection(props);

  if (isHero) {
    return (
      <section
        aria-labelledby={headingId}
        className="relative overflow-hidden rounded-panel border border-primary/20 glass-panel p-5 sm:p-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(var(--primary-rgb),0.14),transparent_50%)]" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/15">
              <Icon className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 id={headingId} className="font-display text-xl font-semibold text-foreground">
                {title}
              </h2>
              {caption && <p className="mt-0.5 text-xs text-muted-foreground/65">{caption}</p>}
            </div>
          </div>
          {children}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-panel border border-border/25 glass-panel p-4"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary/80" />
        <h2 id={headingId} className="font-display text-lg font-semibold text-foreground">
          {title}
        </h2>
      </div>
      {caption && <p className="mt-1 text-xs text-muted-foreground/65">{caption}</p>}
      {children}
    </section>
  );
}
