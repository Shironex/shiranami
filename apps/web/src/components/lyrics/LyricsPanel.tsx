import { useCallback, useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import {
  useLyricsAppearanceStore,
  LYR_SIZE_CLASS,
  LYRICS_SYNCED_PAST_RATIO,
  nextLyricsFontSize,
} from '@/stores/useLyricsAppearanceStore';
import { useLyricsQuery } from '@/hooks/queries/useLyrics';
import { useActiveLineIndex } from '@/lib/lyrics';
import { LyricsList } from '@/components/lyrics/LyricsList';
import { cn } from '@/lib/utils';
import { Loader2, Music2 } from 'lucide-react';

// Common per-line affordances. Size + opacity come from user prefs and are
// composed below via LYR_SIZE_CLASS + CSS custom properties.
const PANEL_BASE_AFFORDANCES =
  'block w-full text-left leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';

// Idle / past lines read their opacity from CSS vars set on the surrounding
// container, so the values can change at runtime without re-tagging classes.
// `hover:opacity-100` restores full contrast on pointer-over (the original
// behavior used a hardcoded `hover:text-muted-foreground/70`).
const PANEL_IDLE = 'text-foreground opacity-[var(--lyrics-idle-opacity)] hover:opacity-100';
const PANEL_PAST = 'text-foreground opacity-[var(--lyrics-past-opacity)]';
const PANEL_ACTIVE_AFFORDANCES = 'text-foreground font-semibold';

export function LyricsPanel() {
  const { t } = useTranslation('lyrics');
  const { t: tToast } = useTranslation('toast');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const seek = usePlaybackStore(s => s.seek);
  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);

  const { data, isLoading, isError } = useLyricsQuery(
    currentTrack?.id ?? null,
    currentTrack?.title ?? '',
    currentTrack?.artist ?? '',
    currentTrack?.album,
    currentTrack?.duration
  );

  useEffect(() => {
    if (isError) {
      toast.error(tToast('failedFetchLyrics'), { id: 'lyrics-fetch-error' });
    }
  }, [isError, tToast]);

  const synced = data?.synced ?? null;
  const plain = data?.plain ?? null;
  const activeLine = useActiveLineIndex(synced);

  const handleLineClick = useCallback((time: number) => seek(time), [seek]);

  if (!currentTrack) return null;

  let content: React.ReactNode;

  if (isLoading) {
    content = (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-muted-foreground/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-medium">{t('finding')}</span>
        </div>
      </div>
    );
  } else if (synced && synced.length > 0) {
    const baseSizeClass = LYR_SIZE_CLASS[lyricsSyncedFontSize];
    const activeSizeClass = LYR_SIZE_CLASS[nextLyricsFontSize(lyricsSyncedFontSize)];
    // CSS vars carry the dynamic opacity values; classes only ever reference
    // them, so Tailwind's compile-time scanning still works.
    const lyricsVars = {
      '--lyrics-idle-opacity': String(lyricsSyncedDimOpacity),
      '--lyrics-past-opacity': String(lyricsSyncedDimOpacity * LYRICS_SYNCED_PAST_RATIO),
    } as CSSProperties;

    content = (
      <div className="flex-1 flex flex-col min-h-0" style={lyricsVars}>
        <LyricsList
          lines={synced}
          activeIndex={activeLine}
          onLineClick={handleLineClick}
          containerClassName="px-5 py-6"
          spacingClassName="space-y-4"
          bottomSpacerClassName="h-[50vh]"
          baseClassName={cn(PANEL_BASE_AFFORDANCES, baseSizeClass)}
          activeClassName={cn(PANEL_ACTIVE_AFFORDANCES, activeSizeClass)}
          pastClassName={PANEL_PAST}
          idleClassName={PANEL_IDLE}
        />
      </div>
    );
  } else if (plain) {
    content = (
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6">
        <pre
          className={cn(
            'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em]',
            LYR_SIZE_CLASS[lyricsPlainFontSize]
          )}
          style={{ opacity: lyricsPlainOpacity }}
        >
          {plain}
        </pre>
      </div>
    );
  } else {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Music2 className="w-7 h-7 text-muted-foreground/20" />
        <p className="text-xs text-muted-foreground/30 font-medium">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          {t('title')}
        </h2>
      </div>
      {content}
    </div>
  );
}

export default LyricsPanel;
