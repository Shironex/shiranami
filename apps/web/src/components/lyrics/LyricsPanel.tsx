import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useLyricsStore } from '@/stores/useLyricsStore';
import { cn } from '@/lib/utils';
import { Loader2, Music2 } from 'lucide-react';

/**
 * Find the index of the current lyric line based on playback time.
 */
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
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentTime = usePlayerStore(s => s.currentTime);

  const synced = useLyricsStore(s => s.synced);
  const plain = useLyricsStore(s => s.plain);
  const isLoading = useLyricsStore(s => s.isLoading);
  const fetchLyrics = useLyricsStore(s => s.fetchLyrics);
  const clear = useLyricsStore(s => s.clear);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!currentTrack) {
      clear();
      return;
    }

    fetchLyrics(
      currentTrack.id,
      currentTrack.title,
      currentTrack.artist,
      currentTrack.album,
      currentTrack.duration
    );
  }, [currentTrack, fetchLyrics, clear]);

  // Auto-scroll to active line
  const activeLine = synced ? findActiveLine(synced, currentTime) : -1;

  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLine]);

  // Seek when clicking a lyric line
  const seek = usePlayerStore(s => s.seek);
  const handleLineClick = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek]
  );

  if (!currentTrack) return null;

  let content: ReactNode;

  if (isLoading) {
    content = (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Searching for lyrics...</span>
        </div>
      </div>
    );
  } else if (synced && synced.length > 0) {
    // Synced lyrics view
    content = (
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-hide px-6 py-8"
      >
        <div className="max-w-lg mx-auto space-y-3">
          {synced.map((line, index) => {
            const isActive = index === activeLine;
            const isPast = index < activeLine;
            return (
              <p
                key={index}
                ref={isActive ? activeLineRef : null}
                onClick={() => handleLineClick(line.time)}
                className={cn(
                  'text-lg font-medium cursor-pointer transition-all duration-300',
                  isActive && 'text-primary text-xl scale-[1.02] origin-left',
                  isPast && 'text-muted-foreground/40',
                  !isActive && !isPast && 'text-muted-foreground/70 hover:text-foreground/80'
                )}
              >
                {line.text}
              </p>
            );
          })}
          {/* Bottom padding so last line can be centered */}
          <div className="h-[40vh]" />
        </div>
      </div>
    );
  } else if (plain) {
    // Plain lyrics view
    content = (
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-8">
        <div className="max-w-lg mx-auto">
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {plain}
          </pre>
        </div>
      </div>
    );
  } else {
    // No lyrics found
    content = (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Music2 className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground/50">No lyrics found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {currentTrack && (
        <div className="px-4 py-3 border-b border-border/50 shrink-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Lyrics
          </h2>
        </div>
      )}

      {/* Content area */}
      {content}
    </div>
  );
}
