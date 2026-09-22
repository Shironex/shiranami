import type { useTranslation } from 'react-i18next';
import type { useAnimationControls } from 'motion/react';
import type { Track } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type AnimationControls = ReturnType<typeof useAnimationControls>;

/** RGB triple string for the ambient-glow gradient (e.g. "120, 80, 200"). */
export interface IPlayerBarAmbient {
  readonly rgb: string;
}

export interface IPlayerBarView {
  /** Bound `player` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** The currently-playing track, or null when playback is idle (bar is hidden). */
  readonly currentTrack: Track | null;
  /**
   * The title line. For a radio stream this is the station's ICY `StreamTitle`
   * once one has arrived and the station's own name until then; for everything
   * else it is `currentTrack.title`. Empty string when nothing is playing.
   */
  readonly titleText: string;
  /** Whether the current track is a live radio stream (hides seek + favorite). */
  readonly isRadio: boolean;
  /** Whether the current track is favorited. */
  readonly isFavorite: boolean;
  /** Whether the seek row (time labels + seekbar) is shown — hidden for radio. */
  readonly showSeekRow: boolean;
  /** Ambient color derived from the album art, for the bar's glow gradient. */
  readonly ambientColor: IPlayerBarAmbient;
  /** Whether the ambient glow is skipped (low-performance mode). */
  readonly lowPerformanceMode: boolean;
  /** Formatted total-duration label shown after the seekbar. */
  readonly durationLabel: string;

  // --- Element visibility (Settings · Interface · Player bar) ---
  /** Whether the album-art thumbnail is shown. */
  readonly showAlbumArt: boolean;
  /** Whether the favorite-element setting is on. */
  readonly showFavorite: boolean;
  /** Whether the favorite (heart) button actually renders (setting on AND not radio). */
  readonly showFavoriteButton: boolean;
  /** Whether the elapsed/total time labels are shown. */
  readonly showTimeLabels: boolean;
  /** Whether the sleep-timer control is shown inline. */
  readonly showSleepTimer: boolean;
  /** Whether the equalizer control is shown inline. */
  readonly showEqualizer: boolean;
  /** Whether the compact-mode button is shown inline. */
  readonly showCompactButton: boolean;
  /** Whether the visualizer toggle is shown inline. */
  readonly showVisualizerButton: boolean;
  /** Whether the lyrics-panel toggle is shown. */
  readonly showLyricsButton: boolean;
  /** Whether the queue-panel toggle is shown. */
  readonly showQueueButton: boolean;
  /** Whether the volume control is shown. */
  readonly showVolume: boolean;
  /** Whether the waveform seekbar replaces the plain seekbar. */
  readonly showWaveformSeekbar: boolean;

  // --- Derived layout flags ---
  /** Whether any utility button (sleep/eq/compact/visualizer) is shown. */
  readonly hasUtilityButtons: boolean;
  /** Whether the right-side button cluster renders at all. */
  readonly hasButtonCluster: boolean;
  /** Whether double-clicking the art opens the Now Playing view. */
  readonly nowPlayingViewEnabled: boolean;
  /** Whether the visualizer is currently on (active styling). */
  readonly showVisualizer: boolean;
  /** Whether the lyrics panel is the active right panel (active styling). */
  readonly lyricsActive: boolean;
  /** Whether the queue panel is the active right panel (active styling). */
  readonly queueActive: boolean;

  // --- Fresh-favorite celebration (heart pop + expanding ring) ---
  /** Animation controls driving the heart pop; passed to the heart's `animate`. */
  readonly heartControls: AnimationControls;
  /** Burst counter — doubles as the ring's remount `key` so each burst replays. */
  readonly favoriteBurst: number;
  /** Whether the expanding ring renders (celebration enabled AND a burst fired). */
  readonly showFavoriteBurst: boolean;

  // --- Tooltips (shortcut hints pre-interpolated) ---
  /** Localized compact-mode tooltip. */
  readonly compactTooltip: string;
  /** Localized visualizer tooltip. */
  readonly visualizerTooltip: string;
  /** Localized lyrics tooltip. */
  readonly lyricsTooltip: string;
  /** Localized queue tooltip. */
  readonly queueTooltip: string;

  // --- Handlers ---
  /** Toggle the current track's favorite flag. */
  readonly onToggleFavorite: () => void;
  /** Enter compact (mini-player) mode. */
  readonly onEnterCompact: () => void;
  /** Toggle the audio visualizer. */
  readonly onToggleVisualizer: () => void;
  /** Toggle the lyrics right panel. */
  readonly onToggleLyrics: () => void;
  /** Toggle the queue right panel. */
  readonly onToggleQueue: () => void;
  /** Open the immersive Now Playing view (double-click on art). */
  readonly onEnterNowPlaying: () => void;
}
