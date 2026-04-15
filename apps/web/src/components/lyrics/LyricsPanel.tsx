import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { useLyricsQuery } from '@/hooks/queries/useLyrics';
import { useActiveLineIndex } from '@/lib/lyrics';
import { LyricsList } from '@/components/lyrics/LyricsList';
import { Loader2, Minus, Music2, Plus } from 'lucide-react';

const OFFSET_MIN = -5;
const OFFSET_MAX = 5;
const OFFSET_STEP = 0.1;

function formatOffset(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toFixed(1)}s`;
}

const PANEL_BASE =
  'block w-full text-left text-base leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';
const PANEL_ACTIVE = 'text-foreground text-lg font-semibold';
const PANEL_PAST = 'text-muted-foreground/25';
const PANEL_IDLE = 'text-muted-foreground/45 hover:text-muted-foreground/70';

export function LyricsPanel() {
  const { t } = useTranslation('lyrics');
  const { t: tToast } = useTranslation('toast');
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const seek = usePlayerStore(s => s.seek);

  const { data, isLoading, isError } = useLyricsQuery(
    currentTrack?.id ?? null,
    currentTrack?.title ?? '',
    currentTrack?.artist ?? '',
    currentTrack?.album,
    currentTrack?.duration,
  );

  useEffect(() => {
    if (isError) {
      toast.error(tToast('failedFetchLyrics'), { id: 'lyrics-fetch-error' });
    }
  }, [isError, tToast]);

  const synced = data?.synced ?? null;
  const plain = data?.plain ?? null;
  const activeLine = useActiveLineIndex(synced);

  const lyricsOffsetSeconds = useAppStore(s => s.lyricsOffsetSeconds);
  const setLyricsOffsetSeconds = useAppStore(s => s.setLyricsOffsetSeconds);

  const handleLineClick = useCallback((time: number) => seek(time), [seek]);
  const handleDecreaseOffset = useCallback(
    () => setLyricsOffsetSeconds(lyricsOffsetSeconds - OFFSET_STEP),
    [lyricsOffsetSeconds, setLyricsOffsetSeconds],
  );
  const handleIncreaseOffset = useCallback(
    () => setLyricsOffsetSeconds(lyricsOffsetSeconds + OFFSET_STEP),
    [lyricsOffsetSeconds, setLyricsOffsetSeconds],
  );
  const handleResetOffset = useCallback(
    () => setLyricsOffsetSeconds(0),
    [setLyricsOffsetSeconds],
  );

  if (!currentTrack) return null;

  const showOffsetControl = !isLoading && synced !== null && synced.length > 0;
  const hasOffset = Math.abs(lyricsOffsetSeconds) > 0.0001;
  const atMin = lyricsOffsetSeconds <= OFFSET_MIN + 0.0001;
  const atMax = lyricsOffsetSeconds >= OFFSET_MAX - 0.0001;

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
    content = (
      <LyricsList
        lines={synced}
        activeIndex={activeLine}
        onLineClick={handleLineClick}
        containerClassName="px-5 py-6"
        spacingClassName="space-y-4"
        bottomSpacerClassName="h-[50vh]"
        baseClassName={PANEL_BASE}
        activeClassName={PANEL_ACTIVE}
        pastClassName={PANEL_PAST}
        idleClassName={PANEL_IDLE}
      />
    );
  } else if (plain) {
    content = (
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6">
        <pre className="text-sm text-muted-foreground/50 whitespace-pre-wrap font-sans leading-relaxed">
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
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          {t('title')}
        </h2>
        {showOffsetControl && (
          <div
            className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/60"
            title={`${t('offset.label')} — ${t('offset.tooltip')}`}
            aria-label={t('offset.label')}
          >
            <button
              type="button"
              onClick={handleDecreaseOffset}
              disabled={atMin}
              aria-label={t('offset.decrease')}
              className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="tabular-nums min-w-[2.25rem] text-center text-muted-foreground/80">
              {formatOffset(lyricsOffsetSeconds)}
            </span>
            <button
              type="button"
              onClick={handleIncreaseOffset}
              disabled={atMax}
              aria-label={t('offset.increase')}
              className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <Plus className="w-3 h-3" />
            </button>
            {hasOffset && (
              <button
                type="button"
                onClick={handleResetOffset}
                className="ml-1 px-1.5 h-5 rounded-sm text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              >
                {t('offset.reset')}
              </button>
            )}
          </div>
        )}
      </div>
      {content}
    </div>
  );
}

export default LyricsPanel;
