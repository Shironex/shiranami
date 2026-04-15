import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useLyricsQuery } from '@/hooks/queries/useLyrics';
import { useActiveLineIndex } from '@/lib/lyrics';
import { LyricsList } from '@/components/lyrics/LyricsList';
import { Loader2, Music2 } from 'lucide-react';

const PANEL_BASE =
  'block w-full text-left text-base leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40';
const PANEL_ACTIVE = 'text-foreground text-lg font-semibold';
const PANEL_PAST = 'text-muted-foreground/25';
const PANEL_IDLE = 'text-muted-foreground/45 hover:text-muted-foreground/70';

export function LyricsPanel() {
  const { t } = useTranslation('lyrics');
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const seek = usePlayerStore(s => s.seek);

  const { data, isLoading } = useLyricsQuery(
    currentTrack?.id ?? null,
    currentTrack?.title ?? '',
    currentTrack?.artist ?? '',
    currentTrack?.album,
    currentTrack?.duration,
    currentTrack?.filePath,
  );

  const synced = data?.synced ?? null;
  const plain = data?.plain ?? null;
  const source = data?.source ?? null;
  const sourceLabel =
    source === 'local-lrc' || source === 'local-txt'
      ? t('source.local')
      : source === 'embedded'
        ? t('source.embedded')
        : source === 'lrclib'
          ? t('source.lrclib')
          : null;
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
      <div className="px-5 py-3.5 border-b border-border/20 shrink-0 flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
          {t('title')}
        </h2>
        {sourceLabel && (
          <span
            title={t('source.tooltip')}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border/30 bg-muted/20 text-[9px] font-semibold uppercase tracking-[0.1em] leading-none text-muted-foreground/70"
          >
            {sourceLabel}
          </span>
        )}
      </div>
      {content}
    </div>
  );
}

export default LyricsPanel;
