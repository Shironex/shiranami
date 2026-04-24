import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAppStore } from '@/stores/useAppStore';
import { cn, isRadioTrack } from '@/lib/utils';
import { formatDuration } from '@shiranami/shared';
import { PlayerControls } from './PlayerControls';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { useWindowControls } from '@/hooks/useWindowControls';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TimeDisplay } from './TimeDisplay';
import { Maximize2, Minimize2, Music, Pin, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function CompactPlayer() {
  const { t } = useTranslation('compact');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const duration = usePlaybackStore(s => s.duration);
  const setCompactMode = useAppStore(s => s.setCompactMode);
  const compactAlwaysOnTop = useAppStore(s => s.compactAlwaysOnTop);
  const toggleCompactAlwaysOnTop = useAppStore(s => s.toggleCompactAlwaysOnTop);
  const lowPerformanceMode = useAppStore(s => s.lowPerformanceMode);
  const ambientColor = useAmbientColor();
  const { minimize: handleMinimize, close: handleClose } = useWindowControls();

  const handleExitCompact = useCallback(() => {
    void setCompactMode(false);
  }, [setCompactMode]);

  const handleToggleAlwaysOnTop = useCallback(() => {
    void toggleCompactAlwaysOnTop();
  }, [toggleCompactAlwaysOnTop]);
  const showSeekBar = !!currentTrack && !isRadioTrack(currentTrack.filePath);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {!lowPerformanceMode && (
        <AnimatePresence>
          <motion.div
            key={ambientColor.hex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.08 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 18% 24%, rgba(${ambientColor.rgb}, 0.95) 0%, transparent 48%)`,
            }}
          />
        </AnimatePresence>
      )}

      <div className="drag flex h-9 shrink-0 items-center justify-between border-b border-border/20 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-2 shrink-0 rounded-full bg-primary/85 shadow-[0_0_10px_rgba(var(--primary-rgb),0.45)]" />
          <span className="shrink-0 font-display text-[11px] font-semibold text-foreground">
            {t('title')}
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
                aria-label={compactAlwaysOnTop ? t('disableAlwaysOnTop') : t('enableAlwaysOnTop')}
              >
                <Pin className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {compactAlwaysOnTop ? t('disableOnTop') : t('keepOnTop')}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleExitCompact}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t('exitCompactMode')}
              >
                <Maximize2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('exitCompactMode')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleMinimize}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t('minimize')}
              >
                <Minimize2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('minimize')}</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={handleClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-red-500/85 hover:text-white"
            aria-label={t('close')}
          >
            <X className="size-3.5" />
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
                {currentTrack?.title ?? t('nothingPlaying')}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {currentTrack ? currentTrack.artist : t('idleSubtitle')}
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
