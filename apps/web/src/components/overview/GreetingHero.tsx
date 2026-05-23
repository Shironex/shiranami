import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import { useWeatherQuery } from '@/hooks/queries/useWeather';
import {
  getGreeting,
  getGreetingSubline,
  getTimeOfDay,
  WEATHER_GLYPH,
  type TimeOfDay,
} from '@/components/overview/overviewUtils';
import { ClockCard } from '@/components/overview/ClockCard';
import { WeatherRow } from '@/components/overview/WeatherRow';

/** Large faint kanji behind the greeting — purely decorative. */
const WATERMARK: Record<TimeOfDay, string> = {
  morning: '朝',
  afternoon: '昼',
  evening: '今夜',
  night: '夜',
};

/**
 * Renderer-side "current session" approximation. The app has no session
 * concept (see research §1.5), so v1 records the wall-clock moment playback
 * first started in this launch and counts forward from there — a faithful
 * stand-in for "you started listening at 22:18 — 47 min so far".
 */
function useSessionSummary() {
  const hasTrack = usePlaybackStore(s => s.currentTrack !== null);
  const startRef = useRef<number | null>(null);
  const [elapsedMin, setElapsedMin] = useState(0);

  useEffect(() => {
    if (hasTrack && startRef.current === null) {
      startRef.current = Date.now();
    }
  }, [hasTrack]);

  useEffect(() => {
    if (!hasTrack) return;
    const tick = () => {
      if (startRef.current !== null) {
        setElapsedMin(Math.floor((Date.now() - startRef.current) / 60000));
      }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [hasTrack]);

  return { active: hasTrack, startedAt: startRef.current, elapsedMin };
}

function GreetingHeroImpl() {
  const { t, i18n } = useTranslation('overview');
  const reducedMotion = useReducedMotion();
  const timeOfDay = getTimeOfDay(new Date().getHours());
  const session = useSessionSummary();

  const weatherEnabled = useWeatherStore(s => s.enabled);
  const weatherCoords = useWeatherStore(s => s.coords);
  const weatherActive = weatherEnabled && weatherCoords !== null;
  const { data: weather, isError: weatherError } = useWeatherQuery(weatherEnabled, weatherCoords);

  const subtitle = session.active
    ? t('session.summary', {
        time:
          session.startedAt !== null
            ? new Date(session.startedAt).toLocaleTimeString(i18n.language, {
                hour: 'numeric',
                minute: '2-digit',
              })
            : '',
        minutes: t('session.minutes', { count: session.elapsedMin }),
      })
    : t('session.summaryNoTracks');

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-border/25 glass-panel p-6 sm:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-6 select-none font-display text-[7rem] leading-none text-primary/[0.07] sm:text-[9rem]"
      >
        {WATERMARK[timeOfDay]}
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
            {t('eyebrow')}
          </div>

          <h2 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {getGreeting()} <em className="text-primary/85">{getGreetingSubline()}</em>
          </h2>

          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>

        <ClockCard
          glyph={weatherActive && weather ? WEATHER_GLYPH[weather.condition] : undefined}
          weatherRow={
            weatherActive ? (
              <WeatherRow
                weather={weather}
                isError={weatherError}
                cityLabel={weatherCoords?.label}
              />
            ) : undefined
          }
        />
      </div>
    </section>
  );
}

export const GreetingHero = memo(GreetingHeroImpl);
