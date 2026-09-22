import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, Disc3, Image, type LucideIcon } from 'lucide-react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useLyricsAppearanceStore } from '@/stores/useLyricsAppearanceStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import {
  useSanctuaryStore,
  nextSanctuaryVariant,
  SANCTUARY_CHROME_TIMEOUT_MS,
  type SanctuaryVariant,
} from '@/stores/useSanctuaryStore';
import { useUIStore, type VinylSize } from '@/stores/useUIStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useWeatherQuery } from '@/hooks/queries/useWeather';
import { useCompanionPresence } from '@/hooks/useCompanionPresence';
import { useLyricsView } from '@/hooks/useLyricsView';
import { useTrackTitle } from '@/hooks/useRadioNowPlaying';
import { useSanctuaryScene } from '@/hooks/useSanctuaryScene';
import type { ISanctuaryViewView } from './SanctuaryView.types';

/**
 * Keys the global shortcut handler owns while the sanctuary is up: they must
 * not double as "activity that exits an auto-entered sanctuary", or a single
 * `F` would exit here *and* toggle there — re-entering the mode it just left.
 */
const GLOBAL_SANCTUARY_KEYS = new Set(['f', 'F', 'Escape']);

/**
 * Vinyl stage footprint per size preference — 'medium' is the width the stage
 * shipped with; the others scale the same vh/vw/rem budget down or up.
 */
const VINYL_STAGE_WIDTH: Record<VinylSize, string> = {
  small: 'w-[min(38vh,35vw,27rem)]',
  medium: 'w-[min(48vh,44vw,34rem)]',
  large: 'w-[min(58vh,52vw,40rem)]',
};

/** Toggle chrome per upcoming variant: its localized label key and icon. */
const NEXT_VARIANT_META: Record<SanctuaryVariant, { labelKey: string; icon: LucideIcon }> = {
  cover: { labelKey: 'showCover', icon: Image },
  clock: { labelKey: 'showClock', icon: Clock3 },
  vinyl: { labelKey: 'showVinyl', icon: Disc3 },
};

export function useSanctuaryView(): ISanctuaryViewView {
  const { t, i18n } = useTranslation('sanctuary');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const variant = useSanctuaryStore(s => s.sanctuaryVariant);
  const setVariant = useSanctuaryStore(s => s.setSanctuaryVariant);
  const vinylSanctuarySize = useUIStore(s => s.vinylSanctuarySize);
  const exitSanctuary = useSanctuaryStore(s => s.exitSanctuary);
  const clockFacePref = useSanctuaryStore(s => s.sanctuaryClockFace);
  const clockFormat = useSanctuaryStore(s => s.sanctuaryClockFormat);
  const clockSeconds = useSanctuaryStore(s => s.sanctuaryClockSeconds);
  const rotation = useSanctuaryStore(s => s.sanctuaryRotation);
  const rotationMinutes = useSanctuaryStore(s => s.sanctuaryRotationMinutes);
  const trackInfoByVariant = useSanctuaryStore(s => s.sanctuaryTrackInfo);
  const timeOfDay = useSanctuaryStore(s => s.sanctuaryTimeOfDay);
  const showWaveformSeekbar = useInterfaceStore(s => s.playerWaveformSeekbar);
  const lyrics = useLyricsView();

  // Follow-the-day: the hour of day owns the stage (and, for clock phases,
  // the face); the user's manual pick and rotation take over otherwise.
  const scene = useSanctuaryScene();
  const effectiveVariant: SanctuaryVariant = timeOfDay ? scene.variant : variant;
  const clockFace = timeOfDay && scene.clockFace !== null ? scene.clockFace : clockFacePref;

  // The resident is chrome here — it rides the same fade; "keeps watch"
  // instead leaves it asleep at 40% in a corner when the chrome swims away.
  const companion = useCompanionPresence();
  const companionKeepsWatch = useCompanionStore(s => s.sanctuaryKeepsWatch);

  const weatherEnabled = useWeatherStore(s => s.enabled);
  const weatherCoords = useWeatherStore(s => s.coords);
  const weather = useWeatherQuery(weatherEnabled && effectiveVariant === 'clock', weatherCoords);

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
    if (effectiveVariant !== 'clock') return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [effectiveVariant]);

  // ── Rotation: the stage quietly advances on a timer ──────────────────────
  // Only while the sanctuary is up (this hook unmounts with it), and never
  // under follow-the-day, where the hour owns the stage.
  useEffect(() => {
    if (timeOfDay || rotation !== 'minutes') return;
    const id = window.setInterval(() => {
      const s = useSanctuaryStore.getState();
      s.setSanctuaryVariant(nextSanctuaryVariant(s.sanctuaryVariant));
    }, rotationMinutes * 60_000);
    return () => window.clearInterval(id);
  }, [timeOfDay, rotation, rotationMinutes]);

  // The sanctuary only exists around a playing track.
  useEffect(() => {
    if (!currentTrack) exitSanctuary();
  }, [currentTrack, exitSanctuary]);

  const weatherLabel =
    weather.data !== undefined
      ? `${Math.round(weather.data.tempC)}° · ${weather.data.label}`
      : null;

  // Radio only: the station's ICY `StreamTitle` when one has arrived, the
  // station name otherwise. `currentTrack.title` for everything else, so this
  // view agrees with the player bar instead of showing a second answer.
  const titleText = useTrackTitle(currentTrack);

  const nextVariant = nextSanctuaryVariant(variant);
  const nextMeta = NEXT_VARIANT_META[nextVariant];

  return {
    hasTrack: Boolean(currentTrack),
    currentTrack,
    titleText,
    variant: effectiveVariant,
    clockFace,
    showTrackInfo: trackInfoByVariant[effectiveVariant],
    // Under follow-the-day the manual toggle would fight the hour — the
    // chrome drops the button rather than surface a dead control.
    showVariantToggle: !timeOfDay,
    vinylStageWidthClass: VINYL_STAGE_WIDTH[vinylSanctuarySize],
    // Reduced motion: the chrome still hides (a screensaver that never clears
    // its controls is not a screensaver) but without the fade transition.
    chromeVisible,
    lyrics,
    hasSyncedLyrics: (lyrics.synced?.length ?? 0) > 0,
    lyricsSyncedDimOpacity,
    showWaveformSeekbar,
    timeLabel: now.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      ...(clockSeconds && { second: '2-digit' as const }),
      // 'system' follows the app language's own hour convention.
      ...(clockFormat === '12h' && { hour12: true }),
      ...(clockFormat === '24h' && { hourCycle: 'h23' as const }),
    }),
    dateLabel: now.toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    weatherLabel,
    companion,
    companionKeepsWatch,
    exitLabel: t('exit'),
    variantToggleLabel: t(nextMeta.labelKey),
    variantToggleIcon: nextMeta.icon,
    onExit: exitSanctuary,
    onToggleVariant: () => setVariant(nextVariant),
  };
}
