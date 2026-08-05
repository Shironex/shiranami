import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useLyricsAppearanceStore } from '@/stores/useLyricsAppearanceStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import { useSanctuaryStore, SANCTUARY_CHROME_TIMEOUT_MS } from '@/stores/useSanctuaryStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useWeatherQuery } from '@/hooks/queries/useWeather';
import { useCompanionPresence } from '@/hooks/useCompanionPresence';
import { useLyricsView } from '@/hooks/useLyricsView';
import type { ISanctuaryViewView } from './SanctuaryView.types';

/**
 * Keys the global shortcut handler owns while the sanctuary is up: they must
 * not double as "activity that exits an auto-entered sanctuary", or a single
 * `F` would exit here *and* toggle there — re-entering the mode it just left.
 */
const GLOBAL_SANCTUARY_KEYS = new Set(['f', 'F', 'Escape']);

export function useSanctuaryView(): ISanctuaryViewView {
  const { t, i18n } = useTranslation('sanctuary');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const variant = useSanctuaryStore(s => s.sanctuaryVariant);
  const setVariant = useSanctuaryStore(s => s.setSanctuaryVariant);
  const exitSanctuary = useSanctuaryStore(s => s.exitSanctuary);
  const showWaveformSeekbar = useInterfaceStore(s => s.playerWaveformSeekbar);
  const lyrics = useLyricsView();

  // The resident is chrome here — it rides the same fade; "keeps watch"
  // instead leaves it asleep at 40% in a corner when the chrome swims away.
  const companion = useCompanionPresence();
  const companionKeepsWatch = useCompanionStore(s => s.sanctuaryKeepsWatch);

  const weatherEnabled = useWeatherStore(s => s.enabled);
  const weatherCoords = useWeatherStore(s => s.coords);
  const weather = useWeatherQuery(weatherEnabled && variant === 'clock', weatherCoords);

  // ── Stillness: chrome swims away after four quiet seconds ────────────────
  const [chromeVisible, setChromeVisible] = useState(true);
  useEffect(() => {
    let timer = window.setTimeout(() => setChromeVisible(false), SANCTUARY_CHROME_TIMEOUT_MS);

    const wake = () => {
      setChromeVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChromeVisible(false), SANCTUARY_CHROME_TIMEOUT_MS);
    };

    const onPointerActivity = () => {
      // An auto-entered (screensaver) sanctuary drops back to where the user
      // was on ANY activity; a deliberately-entered one just shows its chrome.
      if (useSanctuaryStore.getState().sanctuaryAutoEntered) {
        useSanctuaryStore.getState().exitSanctuary();
        return;
      }
      wake();
    };

    const onKeyActivity = (event: KeyboardEvent) => {
      if (
        useSanctuaryStore.getState().sanctuaryAutoEntered &&
        !GLOBAL_SANCTUARY_KEYS.has(event.key)
      ) {
        useSanctuaryStore.getState().exitSanctuary();
        return;
      }
      wake();
    };

    window.addEventListener('pointermove', onPointerActivity);
    window.addEventListener('pointerdown', onPointerActivity);
    window.addEventListener('keydown', onKeyActivity);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onPointerActivity);
      window.removeEventListener('pointerdown', onPointerActivity);
      window.removeEventListener('keydown', onKeyActivity);
    };
  }, []);

  // ── Clock ────────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (variant !== 'clock') return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [variant]);

  // The sanctuary only exists around a playing track.
  useEffect(() => {
    if (!currentTrack) exitSanctuary();
  }, [currentTrack, exitSanctuary]);

  const weatherLabel =
    weather.data !== undefined
      ? `${Math.round(weather.data.tempC)}° · ${weather.data.label}`
      : null;

  return {
    hasTrack: Boolean(currentTrack),
    currentTrack,
    variant,
    // Reduced motion: the chrome still hides (a screensaver that never clears
    // its controls is not a screensaver) but without the fade transition.
    chromeVisible,
    lyrics,
    hasSyncedLyrics: (lyrics.synced?.length ?? 0) > 0,
    lyricsSyncedDimOpacity,
    showWaveformSeekbar,
    timeLabel: now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    dateLabel: now.toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    weatherLabel,
    companion,
    companionKeepsWatch,
    exitLabel: t('exit'),
    variantToggleLabel: variant === 'cover' ? t('showClock') : t('showCover'),
    onExit: exitSanctuary,
    onToggleVariant: () => setVariant(variant === 'cover' ? 'clock' : 'cover'),
  };
}
