import type { CSSProperties } from 'react';
import type { Station } from 'radio-browser-api';

/**
 * Per-row props passed to every virtualized station row via react-window's
 * `rowProps`. The shell receives these merged with react-window's `index` +
 * `style` as `RowComponentProps<IStationRowProps>`.
 */
export interface IStationRowProps {
  /** The full station list, indexed by react-window's `index`. */
  readonly stations: Station[];
  /** The currently-playing track id, used to highlight the active row. */
  readonly currentTrackId: string | null;
  /** Whether playback is active, used to render the play / eq glyph. */
  readonly isPlaying: boolean;
  /** Station ids the user has favorited. */
  readonly favorites: string[];
  /** Start playback at the given index. */
  readonly onPlay: (index: number) => void;
  /** Toggle a station's favorite state. */
  readonly onToggleFavorite: (station: Station) => void;
}

export interface IStationRowView {
  /**
   * The station this row renders, resolved from `stations[index]`. May be
   * `undefined` for the frame where react-window renders a stale row index
   * during a list mutation; the shell guards on it.
   */
  readonly station: Station | undefined;
  /** Inline style react-window assigns for absolute positioning. */
  readonly style: CSSProperties | undefined;
  /** react-window's row index. */
  readonly index: number;
  /** Whether this row's station is the active (playing) track. */
  readonly isActive: boolean;
  /** Whether this row's station is favorited. */
  readonly isFav: boolean;
  /** Whether playback is active (paired with `isActive` to show the eq bars). */
  readonly isPlaying: boolean;
  /** Comma-joined first two tags, or empty string when the station has none. */
  readonly tagsStr: string;
  /** Country flag emoji for the station, or empty string when unresolved. */
  readonly countryFlag: string;
  /** Composed codec + bitrate badge label, or empty string when no codec. */
  readonly codecLabel: string;
  /** Localized aria-label for the favorite toggle (add vs remove). */
  readonly favoriteAriaLabel: string;
  /** Localized "now playing" sr-only label. */
  readonly nowPlayingLabel: string;
  /** Start playback for this row's station. */
  readonly onPlayClick: () => void;
  /** Toggle this row's station favorite state. */
  readonly onFavoriteClick: (event: React.MouseEvent) => void;
  /** Hide a broken favicon and reveal its fallback glyph. */
  readonly onFaviconError: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}
