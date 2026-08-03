import { cn } from '@/lib/utils';
import { ClockCard } from '../ClockCard';
import { WeatherRow } from '../WeatherRow';
import { useGreetingHero } from './GreetingHero.hooks';

/**
 * Overview hero: greeting + session summary on the left, the live clock card
 * (with an optional weather row) on the right.
 */
export default function GreetingHero() {
  const {
    eyebrow,
    greeting,
    greetingSubline,
    subtitle,
    driftNote,
    watermark,
    reducedMotion,
    weatherActive,
    weather,
    weatherError,
    cityLabel,
    clockGlyph,
  } = useGreetingHero();

  const weatherRow = weatherActive ? (
    <WeatherRow weather={weather} isError={weatherError} cityLabel={cityLabel} />
  ) : undefined;

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-border/25 glass-panel p-6 sm:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-6 select-none font-display text-[7rem] leading-none text-primary/[0.07] sm:text-[9rem]"
      >
        {watermark}
      </span>

      <div className="relative grid items-stretch gap-6 lg:grid-cols-[1fr_minmax(0,15rem)]">
        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
            <span
              className={cn(
                'inline-block size-1.5 rounded-full bg-primary',
                !reducedMotion && 'animate-pulse-subtle'
              )}
            />
            {eyebrow}
          </div>

          <h2 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {greeting} <em className="text-primary/85">{greetingSubline}</em>
          </h2>

          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

          {driftNote && (
            <p className="max-w-prose text-xs italic leading-relaxed text-primary/75">
              {driftNote}
            </p>
          )}
        </div>

        <ClockCard glyph={clockGlyph} weatherRow={weatherRow} />
      </div>
    </section>
  );
}
