import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface INowPlayingHeroProps {
  /** Only render when this returns true for the current track. Defaults to always showing. */
  readonly show?: (track: Track) => boolean;
}

export interface INowPlayingHeroView {
  /** Bound `common` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /**
   * The track to render the hero for — non-null only when there is a current
   * track AND the optional `show` predicate passes. Null collapses the hero.
   */
  readonly track: Track | null;
  /** Inline gradient style derived from the ambient album color. */
  readonly heroStyle: React.CSSProperties;
  /** Whether to render the blurred album-art backdrop (art present + not low-perf). */
  readonly showBlurBackdrop: boolean;
  /** Whether double-clicking the artwork enters the full now-playing view. */
  readonly nowPlayingViewEnabled: boolean;
  /** Enter the full now-playing view (bound when enabled). */
  readonly onEnterNowPlaying: () => void;
}
