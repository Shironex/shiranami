import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useLyricsQuery } from '@/hooks/queries/useLyrics';
import { cn } from '@/lib/utils';
import { Loader2, Music2 } from 'lucide-react';

function findActiveLine(lines: Array<{ time: number }>, currentTime: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

export function LyricsPanel() {
  const { t } = useTranslation('lyrics');
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);

  const { data, isLoading } = useLyricsQuery(
    currentTrack?.id ?? null,
    currentTrack?.title ?? '',
    currentTrack?.artist ?? '',
    currentTrack?.album,
    currentTrack?.duration,
  );

  const synced = data?.synced ?? null;
  const plain = data?.plain ?? null;

  const activeLineRef = useRef<HTMLButtonElement>(null);

  const activeLine = synced ? findActiveLine(synced, currentTime) : -1;

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLine]);

  const seek = usePlayerStore(s => s.seek);
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
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6">
        <div className="space-y-4">
          {synced.map((line, index) => {
            const isActive = index === activeLine;
            const isPast = index < activeLine;
            return (
              <button
                key={index}
                ref={isActive ? activeLineRef : null}
                onClick={() => handleLineClick(line.time)}
                type="button"
                className={cn(
                  'block w-full text-left text-base leading-relaxed font-medium cursor-pointer transition-all duration-500 rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                  isActive && 'text-foreground text-lg font-semibold',
                  isPast && 'text-muted-foreground/25',
                  !isActive && !isPast && 'text-muted-foreground/45 hover:text-muted-foreground/70'
                )}
              >
                {line.text}
              </button>
            );
          })}
          <div className="h-[50vh]" />
        </div>
      </div>
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
