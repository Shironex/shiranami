import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import { useWeatherQuery } from '@/hooks/queries/useWeather';
import {
  formatListeningDuration,
  getGreeting,
  getGreetingSubline,
  getTimeOfDay,
  WEATHER_GLYPH,
  type TimeOfDay,
} from '../overviewUtils';
import type { IGreetingHeroView } from './GreetingHero.types';

/** Large faint kanji behind the greeting — purely decorative. */
const WATERMARK: Record<TimeOfDay, string> = {
  morning: '朝',
  afternoon: '昼',
  evening: '今夜',
  night: '夜',
};

/**
 * Renderer-side "current session" approximation. The app has no session
 * concept, so v1 records the wall-clock moment playback first started in this
 * launch and counts forward from there — a faithful stand-in for "you started
 * listening at 22:18 — 47 min so far".
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

export function useGreetingHero(): IGreetingHeroView {
  const { t, i18n } = useTranslation('overview');
  const reducedMotion = useReducedMotion();
  const timeOfDay = getTimeOfDay(new Date().getHours());
  const session = useSessionSummary();

  const weatherEnabled = useWeatherStore(s => s.enabled);
  const weatherCoords = useWeatherStore(s => s.coords);
  const weatherActive = weatherEnabled && weatherCoords !== null;
  const { data: weather, isError: weatherError } = useWeatherQuery(weatherEnabled, weatherCoords);

  const startedTime =
    session.startedAt !== null
      ? new Date(session.startedAt).toLocaleTimeString(i18n.language, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

  const subtitle = session.active
    ? t('session.summary', {
        time: startedTime,
        duration: formatListeningDuration(session.elapsedMin),
      })
    : t('session.summaryNoTracks');

  const clockGlyph = weatherActive && weather ? WEATHER_GLYPH[weather.condition] : undefined;

  return {
    eyebrow: t('eyebrow'),
    greeting: getGreeting(),
    greetingSubline: getGreetingSubline(),
    subtitle,
    watermark: WATERMARK[timeOfDay],
    reducedMotion,
    weatherActive,
    weather,
    weatherError,
    cityLabel: weatherCoords?.label,
    clockGlyph,
  };
}
