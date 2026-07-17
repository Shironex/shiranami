import type { useTranslation } from 'react-i18next';
import type { useAnimationControls } from 'motion/react';
import type { RepeatMode } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type AnimationControls = ReturnType<typeof useAnimationControls>;

export interface IPlayerControlsView {
  /** Bound `player` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether a track is loaded — the play/pause button is disabled without one. */
  readonly hasTrack: boolean;
  /** Whether playback is active (drives the play vs. pause glyph). */
  readonly isPlaying: boolean;
  /** Whether the spinner replaces the play/pause glyph (loading, not yet playing). */
  readonly showLoading: boolean;
  /** Whether shuffle is on (drives the shuffle button's active styling). */
  readonly isShuffled: boolean;
  /** Current repeat mode (drives the repeat icon + active styling). */
  readonly repeatMode: RepeatMode;
  /** Whether repeat is on in any mode (active styling for the repeat button). */
  readonly repeatActive: boolean;
  /** Whether repeat is in "one" mode (drives the Repeat1 vs. Repeat glyph). */
  readonly repeatOne: boolean;
  /** Localized repeat-button tooltip for the current mode. */
  readonly repeatTooltip: string;
  /** Localized shuffle-button tooltip for the current state. */
  readonly shuffleTooltip: string;
  /** Localized play/pause tooltip (with the space-bar shortcut hint). */
  readonly playPauseTooltip: string;
  /** Localized play/pause `aria-label`. */
  readonly playPauseLabel: string;
  /** Localized repeat-button `aria-label`. */
  readonly repeatLabel: string;

  // --- Decorative transport motion (gated by reduced-motion + low-performance) ---
  /** Animation controls for the shuffle glyph's wobble; passed to `animate`. */
  readonly shuffleControls: AnimationControls;
  /** Animation controls for the repeat glyph's flip; passed to `animate`. */
  readonly repeatControls: AnimationControls;
  /** Glow-pulse counter — doubles as the pulse's remount `key` so it replays. */
  readonly glowKey: number;
  /** Whether the play-start glow pulse renders (celebration on AND a pulse fired). */
  readonly showStartGlow: boolean;

  /** Toggle play/pause. */
  readonly onTogglePlay: () => void;
  /** Skip to the next track. */
  readonly onNext: () => void;
  /** Skip to the previous track. */
  readonly onPrevious: () => void;
  /** Toggle shuffle. */
  readonly onToggleShuffle: () => void;
  /** Cycle through repeat modes (off → all → one). */
  readonly onCycleRepeatMode: () => void;
}
