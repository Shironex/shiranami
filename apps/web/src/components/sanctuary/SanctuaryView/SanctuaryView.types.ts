import type { Track } from '@/stores/types';
import type { SanctuaryVariant } from '@/stores/useSanctuaryStore';
import type { useLyricsView } from '@/hooks/useLyricsView';
import type { ICompanionPresence } from '@/hooks/useCompanionPresence';

type LyricsView = ReturnType<typeof useLyricsView>;

export interface ISanctuaryViewView {
  /** No track — the view renders nothing (the hook exits the mode itself). */
  readonly hasTrack: boolean;
  /** The currently-playing track. */
  readonly currentTrack: Track | null;
  /** What sits center-stage: the cover, or the clock. */
  readonly variant: SanctuaryVariant;
  /** Whether the swim-in chrome (controls, buttons) is currently visible. */
  readonly chromeVisible: boolean;
  /** Lyrics data layer (synced lines, active line, click-to-seek). */
  readonly lyrics: LyricsView;
  /** Synced lyrics exist — the ±1 focus stage renders under the cover. */
  readonly hasSyncedLyrics: boolean;
  /** Idle-line dim for the focus stage (the user's synced preference). */
  readonly lyricsSyncedDimOpacity: number;
  /** Waveform seekbar vs. plain seek bar, mirroring the player-bar setting. */
  readonly showWaveformSeekbar: boolean;
  /** Clock variant: the large time label. */
  readonly timeLabel: string;
  /** Clock variant: the long date line. */
  readonly dateLabel: string;
  /** Clock variant: "12° · light rain" when weather is opted in, else null. */
  readonly weatherLabel: string | null;
  /** The resident's live machine read — it rides the chrome fade here. */
  readonly companion: ICompanionPresence;
  /** "Keeps watch": stays asleep at 40% opacity when the chrome swims away. */
  readonly companionKeepsWatch: boolean;
  /** Localized labels for the two chrome buttons. */
  readonly exitLabel: string;
  readonly variantToggleLabel: string;
  /** Leave the sanctuary (Esc, the exit button, or auto-exit). */
  readonly onExit: () => void;
  /** Flip between the cover and clock center stages. */
  readonly onToggleVariant: () => void;
}
