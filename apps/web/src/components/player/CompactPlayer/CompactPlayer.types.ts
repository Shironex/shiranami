import type { useTranslation } from 'react-i18next';
import type { Track } from '@/stores/types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** RGB triple + hex for the compact ambient-glow gradient. */
export interface ICompactAmbient {
  readonly rgb: string;
  readonly hex: string;
}

export interface ICompactPlayerView {
  /** Bound `compact` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** The currently-playing track, or null when idle. */
  readonly currentTrack: Track | null;
  /** Title text — falls back to a localized idle label when nothing plays. */
  readonly titleText: string;
  /** Artist text — falls back to a localized idle subtitle when nothing plays. */
  readonly artistText: string;
  /** Formatted total-duration label shown after the seekbar. */
  readonly durationLabel: string;

  // --- Ambient + performance ---
  /** Ambient color derived from the album art, for the glow gradient. */
  readonly ambientColor: ICompactAmbient;
  /** Ambient intensity (0 hides the glow). */
  readonly compactAmbientIntensity: number;
  /** Whether the ambient glow renders (intensity > 0 and not low-performance). */
  readonly showAmbient: boolean;
  /** Whether low-performance mode is on — softens animation. */
  readonly lowPerformanceMode: boolean;
  /** Tempo-locked breathing: pulse the status dot at the track's bar period. */
  readonly breathing: boolean;

  // --- Element visibility ---
  /** Whether the album-art button is shown. */
  readonly compactShowAlbumArt: boolean;
  /** Whether the album name line is shown (setting on). */
  readonly compactShowAlbum: boolean;
  /** Whether the album name line actually renders (setting on AND a track has an album). */
  readonly showAlbumLine: boolean;
  /** Album name to render in the album line, when present. */
  readonly albumName: string;
  /** Whether the volume control is shown. */
  readonly compactShowVolume: boolean;
  /** Whether the favorite button is shown. */
  readonly compactShowFavorite: boolean;
  /** Whether the lyrics toggle is shown. */
  readonly compactShowLyrics: boolean;
  /** Whether the seek row renders (seek enabled, a track, and not radio). */
  readonly showSeekBar: boolean;

  // --- Title-bar state ---
  /** Whether the lyrics overlay is open (also drives window height). */
  readonly lyricsOpen: boolean;
  /** Whether the lyrics panel actually renders (open AND a track is playing). */
  readonly showLyricsPanel: boolean;
  /** Whether the compact window is pinned always-on-top. */
  readonly compactAlwaysOnTop: boolean;

  // --- Pre-resolved font-size class names ---
  /** Title line class for the current font-size preference. */
  readonly titleClass: string;
  /** Artist line class for the current font-size preference. */
  readonly artistClass: string;
  /** Album line class for the current font-size preference. */
  readonly albumClass: string;

  // --- Refs ---
  /** Ref for the lyrics toggle button (focus returns here on close). */
  readonly lyricsButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Ref for the lyrics panel region (receives focus on open). */
  readonly lyricsPanelRef: React.RefObject<HTMLDivElement | null>;

  // --- Handlers ---
  /** Toggle the lyrics overlay open/closed. */
  readonly onToggleLyrics: () => void;
  /** Toggle always-on-top. */
  readonly onToggleAlwaysOnTop: () => void;
  /** Exit compact mode back to the full window. */
  readonly onExitCompact: () => void;
  /** Minimize the compact window. */
  readonly onMinimize: () => void;
  /** Exit compact and surface the Now Playing view (album-art click). */
  readonly onAlbumArtClick: () => void;
  /** Escape-to-close handler for the lyrics region. */
  readonly onLyricsKeyDown: (e: React.KeyboardEvent) => void;
}
