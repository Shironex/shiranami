import { useWeatherRow } from './WeatherRow.hooks';
import type { IWeatherRowProps } from './WeatherRow.types';

/**
 * The clock card's weather row. Shows the current condition + temperature and a
 * localized flavor line, or a single "unavailable" line when weather is missing.
 */
export default function WeatherRow(props: IWeatherRowProps) {
  const { isUnavailable, unavailableLabel, weatherLine, flavorLine } = useWeatherRow(props);

  if (isUnavailable) {
    return <p className="truncate text-sm text-muted-foreground/60">{unavailableLabel}</p>;
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground/85">{weatherLine}</p>
      <p className="truncate text-xs text-muted-foreground/60">{flavorLine}</p>
    </div>
  );
}
