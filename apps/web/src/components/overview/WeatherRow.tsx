import { useTranslation } from 'react-i18next';
import type { WeatherCurrent } from '@shiranami/contracts';

interface WeatherRowProps {
  weather: WeatherCurrent | undefined;
  isError: boolean;
  /** "City, Country" label from the geocode, shown faintly under the line. */
  cityLabel?: string;
}

/**
 * The clock card's weather row. Condition labels come from Open-Meteo in
 * English; only the chrome (the flavor line, "unavailable") is localized. Temp
 * is formatted as a whole degree.
 */
export function WeatherRow({ weather, isError, cityLabel }: WeatherRowProps) {
  const { t } = useTranslation('overview');

  if (isError || !weather) {
    return <p className="truncate text-sm text-muted-foreground/60">{t('mood.unavailable')}</p>;
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground/85">
        {t('mood.weatherLine', {
          condition: weather.label,
          temp: Math.round(weather.tempC),
        })}
      </p>
      <p className="truncate text-xs text-muted-foreground/60">
        {cityLabel ? `${cityLabel} · ` : ''}
        {t(`mood.flavor.${weather.condition}`)}
      </p>
    </div>
  );
}
