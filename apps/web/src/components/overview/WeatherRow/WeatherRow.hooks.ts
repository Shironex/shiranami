import { useTranslation } from 'react-i18next';
import type { IWeatherRowProps, IWeatherRowView } from './WeatherRow.types';

/**
 * Composes the clock card's weather row. Condition labels come from Open-Meteo
 * in English; only the chrome (the flavor line, "unavailable") is localized.
 * Temp is formatted as a whole degree.
 */
export function useWeatherRow({ weather, isError, cityLabel }: IWeatherRowProps): IWeatherRowView {
  const { t } = useTranslation('overview');

  if (isError || !weather) {
    return {
      isUnavailable: true,
      unavailableLabel: t('mood.unavailable'),
      weatherLine: '',
      flavorLine: '',
    };
  }

  const cityPrefix = cityLabel ? `${cityLabel} · ` : '';

  return {
    isUnavailable: false,
    unavailableLabel: '',
    weatherLine: t('mood.weatherLine', {
      condition: weather.label,
      temp: Math.round(weather.tempC),
    }),
    flavorLine: `${cityPrefix}${t(`mood.flavor.${weather.condition}`)}`,
  };
}
