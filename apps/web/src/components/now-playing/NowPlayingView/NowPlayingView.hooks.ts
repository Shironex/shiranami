import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic2, ListMusic, SlidersVertical, type LucideIcon } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import { formatTempoKeyLine } from '@/lib/tempoKeyFormat';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore, type VinylSize } from '@/stores/useUIStore';
import { useLyricsAppearanceStore } from '@/stores/useLyricsAppearanceStore';
import { useViewStore } from '@/stores/useViewStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useLyricsView } from '@/hooks/useLyricsView';
import { useCompanionPresence } from '@/hooks/useCompanionPresence';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { useTrackTitle } from '@/hooks/useRadioNowPlaying';
import { cn } from '@/lib/utils';
import type { LyricsFontSize } from '@/stores/useLyricsAppearanceStore';
import type {
  ActivePanel,
  INowPlayingPanelButton,
  INowPlayingViewView,
} from './NowPlayingView.types';

const NP_PLAIN_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-xs @5xl:text-sm @7xl:text-base',
  base: 'text-sm @5xl:text-base @7xl:text-lg',
  lg: 'text-base @5xl:text-lg @7xl:text-xl',
  xl: 'text-lg @5xl:text-xl @7xl:text-2xl',
};

const NP_SYNCED_BASE_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-sm @5xl:text-base @7xl:text-lg',
  base: 'text-base @5xl:text-lg @7xl:text-xl',
  lg: 'text-lg @5xl:text-xl @7xl:text-2xl',
  xl: 'text-xl @5xl:text-2xl @7xl:text-3xl',
};

const NP_SYNCED_ACTIVE_SIZE_CLASS: Record<LyricsFontSize, string> = {
  sm: 'text-lg @5xl:!text-xl @7xl:!text-2xl',
  base: 'text-xl @5xl:!text-2xl @7xl:!text-3xl',
  lg: 'text-2xl @5xl:!text-3xl @7xl:!text-4xl',
  xl: 'text-3xl @5xl:!text-4xl @7xl:!text-4xl',
};

const NP_BASE_SHARED =
  'block w-full text-left leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';

const NP_IDLE = 'text-foreground opacity-[var(--lyrics-idle-opacity)] hover:opacity-100';
const NP_PAST = 'text-foreground opacity-[var(--lyrics-past-opacity)]';

const NP_PLAIN_TEXT_SHARED =
  'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em] leading-relaxed';

const PANEL_ORDER: ActivePanel[] = ['lyrics', 'queue', 'eq'];

/**
 * Disc width inside the artwork slot per size preference — 'large' fills the
 * slot, exactly what the display did before the preference existed.
 */
const NP_VINYL_SIZE_CLASS: Record<VinylSize, string> = {
  small: 'w-[70%]',
  medium: 'w-[85%]',
  large: 'w-full',
};

const PANEL_META: Record<ActivePanel, { icon: LucideIcon; showKey: string; hideKey: string }> = {
  lyrics: { icon: Mic2, showKey: 'showLyrics', hideKey: 'hideLyrics' },
  queue: { icon: ListMusic, showKey: 'showQueue', hideKey: 'hideQueue' },
  eq: { icon: SlidersVertical, showKey: 'showEq', hideKey: 'hideEq' },
};

export function useNowPlayingView(): INowPlayingViewView {
  const { t } = useTranslation('nowPlaying');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const duration = usePlaybackStore(s => s.duration);
  const showWaveformSeekbar = useInterfaceStore(s => s.playerWaveformSeekbar);
  const exitNowPlaying = useViewStore(s => s.exitNowPlaying);
  const panel = useUIStore(s => s.nowPlayingPanel);
  const togglePanel = useUIStore(s => s.toggleNowPlayingPanel);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const vinylDisplayEnabled = useUIStore(s => s.vinylDisplayEnabled);
  const vinylNowPlayingSize = useUIStore(s => s.vinylNowPlayingSize);
  const albumArtTiltEnabled = useDecorativeMotion();
  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);

  const lyricsPresentation = useLyricsAppearanceStore(s => s.lyricsPresentation);

  const lyrics = useLyricsView();

  // Radio only: the station's ICY `StreamTitle` when one has arrived, the
  // station name otherwise. `currentTrack.title` for everything else, so this
  // view agrees with the player bar instead of showing a second answer.
  const titleText = useTrackTitle(currentTrack);

  // The resident relocates to the album art's lower-right corner here (the
  // player bar — its usual perch — is hidden in this view).
  const companion = useCompanionPresence();

  // The focus stage only replaces the *synced* list — loading, plain-text and
  // empty states keep the classic LyricsBody branches.
  const showLyricsFocus =
    lyricsPresentation === 'focus' && !lyrics.isLoading && (lyrics.synced?.length ?? 0) > 0;

  const lyricsClasses = useMemo(
    () => ({
      syncedBase: cn(NP_BASE_SHARED, NP_SYNCED_BASE_SIZE_CLASS[lyricsSyncedFontSize]),
      syncedActive: cn(
        'text-foreground font-semibold',
        NP_SYNCED_ACTIVE_SIZE_CLASS[lyricsSyncedFontSize]
      ),
      syncedPast: NP_PAST,
      syncedIdle: NP_IDLE,
      plainText: cn(NP_PLAIN_TEXT_SHARED, NP_PLAIN_SIZE_CLASS[lyricsPlainFontSize]),
    }),
    [lyricsSyncedFontSize, lyricsPlainFontSize]
  );

  const panelButtons = useMemo<INowPlayingPanelButton[]>(
    () =>
      PANEL_ORDER.map(id => {
        const meta = PANEL_META[id];
        const isActive = panel === id;
        return {
          id,
          icon: meta.icon,
          isActive,
          label: isActive ? t(meta.hideKey) : t(meta.showKey),
        };
      }),
    [panel, t]
  );

  const durationLabel = useMemo(() => formatDuration(duration), [duration]);

  // The analysis engine's estimates, when the track carries them: a small
  // "≈ 82 BPM · A minor" line under the artist/album. Null hides the line.
  const tempoKeyLine = formatTempoKeyLine(currentTrack?.bpm, currentTrack?.musicalKey);

  // Exit if no track is playing.
  useEffect(() => {
    if (!currentTrack) {
      exitNowPlaying();
    }
  }, [currentTrack, exitNowPlaying]);

  return {
    t,
    hasTrack: Boolean(currentTrack),
    currentTrack,
    titleText,
    durationLabel,
    tempoKeyLine,
    showWaveformSeekbar,
    panel,
    panelVisible: panel !== null,
    companion,
    companionVisible: companion.enabled,
    panelButtons,
    panelGroupLabel: t('panelGroup'),
    lowPerformanceMode,
    vinylDisplayEnabled,
    vinylSizeClass: NP_VINYL_SIZE_CLASS[vinylNowPlayingSize],
    albumArtTiltEnabled,
    lyricsClasses,
    lyrics,
    showLyricsFocus,
    lyricsPlainOpacity,
    lyricsSyncedDimOpacity,
    onTogglePanel: togglePanel,
    onExit: exitNowPlaying,
  };
}
