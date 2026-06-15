import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlayerOverflowMenuView {
  /** Bound `player` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Whether the active-state dot shows on the "more" trigger. */
  readonly hasActive: boolean;
  /** Whether the visualizer is on (drives the visualizer toggle's active styling). */
  readonly showVisualizer: boolean;
  /** Whether the sleep-timer entry is visible. */
  readonly showSleepTimer: boolean;
  /** Whether the equalizer entry is visible. */
  readonly showEqualizer: boolean;
  /** Whether the compact-mode entry is visible. */
  readonly showCompactButton: boolean;
  /** Whether the visualizer entry is visible. */
  readonly showVisualizerButton: boolean;
  /** Localized compact-mode tooltip (shortcut hint pre-interpolated). */
  readonly compactTooltip: string;
  /** Enter compact (mini-player) mode. */
  readonly onEnterCompact: () => void;
  /** Toggle the audio visualizer. */
  readonly onToggleVisualizer: () => void;
}
