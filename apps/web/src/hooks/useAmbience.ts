import { useEffect } from 'react';
import { getAmbientDriver } from '@/lib/ambient/driver';
import { useWeatherQuery } from '@/hooks/queries/useWeather';
import { useAmbientStore } from '@/stores/useAmbientStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

/**
 * Runs the ambience mixer for the whole app: starts the driver (which loads
 * the engine only once ambience is first heard) and feeds it the weather for
 * "Follow the weather". Mount once, next to `useAudioEngine`.
 *
 * The weather comes from the same cached query the Overview clock card and
 * the companion's outfit read (same key, same 15-minute staleness), and it is
 * only asked for while ambience, the follow toggle and the opt-in weather are
 * all on, so it never adds a request of its own.
 */
export function useAmbience(): void {
  const ambienceEnabled = useAmbientStore(s => s.enabled);
  const followWeather = useAmbientStore(s => s.followWeather);
  const weatherEnabled = useWeatherStore(s => s.enabled);
  const weatherCoords = useWeatherStore(s => s.coords);
  const { data: weather } = useWeatherQuery(
    weatherEnabled && ambienceEnabled && followWeather,
    weatherCoords
  );
  const raining = weather?.condition === 'rain' || weather?.condition === 'thunderstorm';

  useEffect(() => {
    const driver = getAmbientDriver();
    driver.start();
    return () => driver.stop();
  }, []);

  useEffect(() => {
    getAmbientDriver().setRaining(weatherEnabled && followWeather && raining);
  }, [weatherEnabled, followWeather, raining]);
}
