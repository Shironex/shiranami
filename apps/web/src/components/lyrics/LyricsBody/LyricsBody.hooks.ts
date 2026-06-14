import type { CSSProperties } from 'react';
import { LYRICS_SYNCED_PAST_RATIO } from '@/stores/useLyricsAppearanceStore';
import type { ILyricsBodyProps } from './LyricsBody.types';

const DEFAULT_SYNCED_WRAPPER = 'flex-1 flex flex-col min-h-0';

export interface ILyricsBodyDerived {
  /** Synced lyrics are present and non-empty — render the timed list. */
  readonly hasSynced: boolean;
  /** No synced lines, but plain text is available. */
  readonly hasPlain: boolean;
  /** CSS custom properties feeding idle/past synced-line opacity. */
  readonly lyricsVars: CSSProperties;
  /** Resolved wrapper class for the synced list (falls back to a flex column). */
  readonly syncedWrapperClassName: string;
}

export function useLyricsBody({
  synced,
  plain,
  syncedDimOpacity,
  syncedWrapperClassName,
}: ILyricsBodyProps): ILyricsBodyDerived {
  const hasSynced = synced !== null && synced.length > 0;
  const hasPlain = !hasSynced && plain !== null && plain.length > 0;

  const lyricsVars = {
    '--lyrics-idle-opacity': String(syncedDimOpacity),
    '--lyrics-past-opacity': String(syncedDimOpacity * LYRICS_SYNCED_PAST_RATIO),
  } as CSSProperties;

  return {
    hasSynced,
    hasPlain,
    lyricsVars,
    syncedWrapperClassName: syncedWrapperClassName ?? DEFAULT_SYNCED_WRAPPER,
  };
}
