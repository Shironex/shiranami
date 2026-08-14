import type { LucideIcon } from 'lucide-react';
import type { Track } from '@/stores/types';
import type { SanctuaryClockFace, SanctuaryVariant } from '@/stores/useSanctuaryStore';
import type { useLyricsView } from '@/hooks/useLyricsView';
import type { ICompanionPresence } from '@/hooks/useCompanionPresence';

type LyricsView = ReturnType<typeof useLyricsView>;

export interface ISanctuaryViewView {
  /** No track — the view renders nothing (the hook exits the mode itself). */
  readonly hasTrack: boolean;
  /** The currently-playing track. */
  readonly currentTrack: Track | null;
  /**
   * The title line. For a radio stream this is the station's ICY `StreamTitle`
   * once one has arrived and the station's own name until then; for everything
   * else it is `currentTrack.title`. Empty string when nothing is playing.
   */
  readonly titleText: string;
  /**
   * What sits center-stage: the cover, the clock, or the vinyl. Already the
   * effective pick — under follow-the-day the hour decides, not the setting.
   */
  readonly variant: SanctuaryVariant;
  /** Clock variant: how the numerals are drawn (may come from the scene). */
  readonly clockFace: SanctuaryClockFace;
  /** Whether the current stage keeps the title/artist lines on screen. */
  readonly showTrackInfo: boolean;
  /** The manual stage toggle hides while follow-the-day owns the stage. */
  readonly showVariantToggle: boolean;
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
  /** Icon for the variant toggle — always previews the NEXT center stage. */
  readonly variantToggleIcon: LucideIcon;
  /** Leave the sanctuary (Esc, the exit button, or auto-exit). */
  readonly onExit: () => void;
  /** Advance the center stage: cover → clock → vinyl → cover. */
  readonly onToggleVariant: () => void;
}
