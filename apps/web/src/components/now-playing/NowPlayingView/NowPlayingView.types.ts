import type { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import type { Track } from '@/stores/types';
import type { NowPlayingPanel } from '@/stores/useUIStore';
import type { LyricsFontSize } from '@/stores/useLyricsAppearanceStore';
import type { useLyricsView } from '@/hooks/useLyricsView';

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type LyricsView = ReturnType<typeof useLyricsView>;

/** A panel id that is actually rendered (the `null` "no panel" case excluded). */
export type ActivePanel = Exclude<NowPlayingPanel, null>;

/** Re-exported so the shell's interface can name panels without importing the store. */
export type { NowPlayingPanel, LyricsFontSize };

/** One render-ready entry in the lyrics / queue / EQ panel-toggle group. */
export interface INowPlayingPanelButton {
  /** Panel id this button toggles. */
  readonly id: ActivePanel;
  /** Icon component for the toggle. */
  readonly icon: LucideIcon;
  /** Localized show/hide label (depends on whether this panel is active). */
  readonly label: string;
  /** Whether this panel is the active one. */
  readonly isActive: boolean;
}

/** Pre-resolved Tailwind class names for the synced + plain lyrics bodies. */
export interface INowPlayingLyricsClasses {
  /** Base class for synced lines (size derived from the user's font-size pref). */
  readonly syncedBase: string;
  /** Active synced line class (size derived from the user's font-size pref). */
  readonly syncedActive: string;
  /** Past synced line class. */
  readonly syncedPast: string;
  /** Idle synced line class. */
  readonly syncedIdle: string;
  /** Plain-lyrics text class (size derived from the user's font-size pref). */
  readonly plainText: string;
}

export interface INowPlayingViewView {
  /** Bound `nowPlaying` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** No track is playing — the view renders nothing. */
  readonly hasTrack: boolean;
  /** The currently-playing track (null only transiently, before the shell bails). */
  readonly currentTrack: Track | null;
  /** Formatted total-duration label for the track. */
  readonly durationLabel: string;
  /** Tempo + key line (e.g. `'128 BPM · A minor'`); empty when both unknown. */
  readonly metadataLine: string;
  /** Whether the waveform seekbar is shown instead of the plain seek bar. */
  readonly showWaveformSeekbar: boolean;
  /** The active right-column panel, or null when the panel is hidden. */
  readonly panel: NowPlayingPanel;
  /** Whether any panel is visible — drives the two-column vs centered layout. */
  readonly panelVisible: boolean;
  /** Render-ready entries for the lyrics / queue / EQ toggle group. */
  readonly panelButtons: readonly INowPlayingPanelButton[];
  /** Localized label for the toggle group's `aria-label`. */
  readonly panelGroupLabel: string;
  /** Whether low-performance mode is on — softens panel-switch animation. */
  readonly lowPerformanceMode: boolean;
  /** Pre-resolved lyrics body class names. */
  readonly lyricsClasses: INowPlayingLyricsClasses;
  /** Lyrics data layer (synced/plain lines, active line, loading, click handler). */
  readonly lyrics: LyricsView;
  /** Idle-line opacity for plain lyrics. */
  readonly lyricsPlainOpacity: number;
  /** Dim opacity for inactive synced lyrics. */
  readonly lyricsSyncedDimOpacity: number;
  /** Toggle a panel on, or back off when it is already active. */
  readonly onTogglePanel: (panel: ActivePanel) => void;
  /** Leave the full-screen now-playing view. */
  readonly onExit: () => void;
}
