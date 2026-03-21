import { memo, useCallback } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Maximize2, Minimize2, Music, Pin, X } from 'lucide-react';

function isRadioTrack(filePath: string): boolean {
  return filePath.startsWith('shiranami-radio://');
}

const TimeDisplay = memo(function TimeDisplay() {
  const currentTime = usePlayerStore(s => s.currentTime);
  const scrubTime = usePlayerStore(s => s.scrubTime);
  return <>{formatDuration(scrubTime ?? currentTime)}</>;
});

export function CompactPlayer() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const duration = usePlayerStore(s => s.duration);
  const setCompactMode = useAppStore(s => s.setCompactMode);
  const compactAlwaysOnTop = useAppStore(s => s.compactAlwaysOnTop);
  const toggleCompactAlwaysOnTop = useAppStore(s => s.toggleCompactAlwaysOnTop);
  const ambientColor = useAmbientColor();

  const handleExitCompact = useCallback(() => {
    void setCompactMode(false);
  }, [setCompactMode]);

  const handleMinimize = useCallback(() => window.electronAPI?.window.minimize(), []);
  const handleClose = useCallback(() => window.electronAPI?.window.close(), []);
  const handleToggleAlwaysOnTop = useCallback(() => {
    void toggleCompactAlwaysOnTop();
  }, [toggleCompactAlwaysOnTop]);
  const showSeekBar = !!currentTrack && !isRadioTrack(currentTrack.filePath);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] transition-all duration-[2s]"
        style={{
          background: `radial-gradient(circle at 18% 24%, rgba(${ambientColor.rgb}, 0.95) 0%, transparent 48%)`,
        }}
      />

      <div className="drag flex h-9 shrink-0 items-center justify-between border-b border-border/20 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-2 shrink-0 rounded-full bg-primary/85 shadow-[0_0_10px_rgba(167,139,250,0.45)]" />
          <span className="shrink-0 font-display text-[11px] font-semibold text-foreground">
            Compact Mode
          </span>
          {currentTrack && (
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">
              {currentTrack.title}
            </span>
          )}
        </div>

        <div className="no-drag flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggleAlwaysOnTop}
                className={cn(
                  'flex size-7 items-center justify-center rounded-lg transition-colors',
                  compactAlwaysOnTop
                    ? 'bg-primary/15 text-primary hover:bg-primary/20'
                    : 'text-muted-foreground/65 hover:bg-accent hover:text-foreground'
                )}
                aria-label={compactAlwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
              >
                <Pin className="size-3.25" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {compactAlwaysOnTop ? 'Disable always on top' : 'Keep on top'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleExitCompact}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Exit compact mode"
              >
                <Maximize2 className="size-3.25" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Exit compact mode</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleMinimize}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Minimize"
              >
                <Minimize2 className="size-3.25" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Minimize</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={handleClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-red-500/85 hover:text-white"
            aria-label="Close"
          >
            <X className="size-3.25" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center p-2.5">
        <div className="glass-subtle relative flex h-full w-full items-stretch gap-2.5 overflow-hidden rounded-[20px] border border-border/25 p-2.5">
          <div className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/20">
            {currentTrack?.albumArt ? (
              <img
                src={currentTrack.albumArt}
                alt={currentTrack.album}
                className="h-full w-full object-cover"
              />
            ) : (
              <Music className="size-7 text-muted-foreground/45" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="min-w-0">
              <p className={cn('truncate text-sm font-semibold text-foreground', !currentTrack && 'text-muted-foreground')}>
                {currentTrack?.title ?? 'Nothing playing'}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {currentTrack ? currentTrack.artist : 'Start playback to keep a smaller player on screen.'}
              </p>
              {currentTrack?.album && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground/65">
                  {currentTrack.album}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-3.5">
                <PlayerControls />
                <VolumeControl sliderClassName="w-12" />
              </div>

              {showSeekBar ? (
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="w-7 text-right text-[10px] font-medium tabular-nums text-muted-foreground/70">
                    <TimeDisplay />
                  </span>
                  <div className="min-w-0 flex-1">
                    <SeekBar />
                  </div>
                  <span className="w-7 text-[10px] font-medium tabular-nums text-muted-foreground/70">
                    {formatDuration(duration)}
                  </span>
                </div>
              ) : (
                <div className="h-6" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
