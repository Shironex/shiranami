import { useTranslation } from 'react-i18next';
import {
  AudioLines,
  ListMusic,
  Mic2,
  Minimize2,
  Moon,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import type {
  IPlayerBarPreviewProps,
  IPlayerBarPreviewView,
  IPlayerWaveBar,
  PlayerElementKey,
} from './PlayerBarPreview.types';

/** Fixed bar heights (%) for the mini waveform seek mock. */
const PREVIEW_WAVE_BARS: readonly number[] = [
  30, 55, 40, 70, 50, 85, 45, 65, 90, 50, 60, 40, 75, 55, 95, 45, 70, 50, 80, 40, 60, 35, 50, 30,
];

/** Fraction of the waveform that reads as "played" (tinted primary). */
const WAVE_PLAYED_FRACTION = 0.38;

const WAVE_BARS: readonly IPlayerWaveBar[] = PREVIEW_WAVE_BARS.map((height, i) => ({
  height,
  played: i / PREVIEW_WAVE_BARS.length < WAVE_PLAYED_FRACTION,
}));

const PLAYER_UTILITY_ICONS: ReadonlyArray<{ key: PlayerElementKey; Icon: LucideIcon }> = [
  { key: 'playerSleepTimer', Icon: Moon },
  { key: 'playerEqualizer', Icon: SlidersHorizontal },
  { key: 'playerCompactButton', Icon: Minimize2 },
  { key: 'playerVisualizerButton', Icon: AudioLines },
  { key: 'playerLyricsButton', Icon: Mic2 },
  { key: 'playerQueueButton', Icon: ListMusic },
];

/**
 * Reads the real interface store so hidden player-bar elements collapse away
 * live, and resolves the hover spotlight into a per-element flag. Core controls
 * (prev/play/next, seek) are unconditional here as they are in the real bar.
 */
export function usePlayerBarPreview({
  highlightedKey = null,
}: IPlayerBarPreviewProps): IPlayerBarPreviewView {
  const { t } = useTranslation('settings');
  const s = useInterfaceStore();

  const spotlight = (key: PlayerElementKey) => highlightedKey === key;

  return {
    title: t('app.interface.playerPreview'),
    albumArt: { visible: s.playerAlbumArt, highlighted: spotlight('playerAlbumArt') },
    favorite: { visible: s.playerFavorite, highlighted: spotlight('playerFavorite') },
    timeLabels: { visible: s.playerTimeLabels, highlighted: spotlight('playerTimeLabels') },
    volume: { visible: s.playerVolume, highlighted: spotlight('playerVolume') },
    utilityElements: PLAYER_UTILITY_ICONS.map(({ key, Icon }) => ({
      key,
      Icon,
      visible: s[key],
      highlighted: spotlight(key),
    })),
    showWaveformSeekbar: s.playerWaveformSeekbar,
    waveformHighlighted: spotlight('playerWaveformSeekbar'),
    waveBars: WAVE_BARS,
  };
}
