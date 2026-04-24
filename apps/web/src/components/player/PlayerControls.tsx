import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export const PlayerControls = memo(function PlayerControls() {
  const { t } = useTranslation('player');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const isLoading = usePlaybackStore(s => s.isLoading);
  const isShuffled = usePlaybackStore(s => s.isShuffled);
  const repeatMode = usePlaybackStore(s => s.repeatMode);
  const togglePlay = usePlaybackStore(s => s.togglePlay);
  const next = usePlaybackStore(s => s.next);
  const previous = usePlaybackStore(s => s.previous);
  const toggleShuffle = usePlaybackStore(s => s.toggleShuffle);
  const cycleRepeatMode = usePlaybackStore(s => s.cycleRepeatMode);
  const showLoading = isLoading && !isPlaying;

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleShuffle}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200',
              isShuffled
                ? 'text-primary'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
            aria-label={t('shuffle')}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{isShuffled ? t('shuffleOn') : t('shuffleOff')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={previous}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/80 hover:text-foreground transition-colors"
            aria-label={t('previous')}
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top">{t('previousTooltip')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.04 }}
            onClick={togglePlay}
            disabled={!currentTrack}
            className={cn(
              'w-10 h-10 flex items-center justify-center rounded-full',
              'bg-primary text-primary-foreground',
              'shadow-md shadow-primary/20',
              'hover:shadow-lg hover:shadow-primary/30',
              'transition-shadow duration-200',
              'disabled:opacity-50'
            )}
            aria-label={isPlaying ? t('pause') : t('play')}
          >
            <AnimatePresence mode="wait" initial={false}>
              {showLoading ? (
                <motion.div key="loading" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                </motion.div>
              ) : isPlaying ? (
                <motion.div key="pause" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}>
                  <Pause className="w-4.5 h-4.5 fill-current" />
                </motion.div>
              ) : (
                <motion.div key="play" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}>
                  <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top">{isPlaying ? t('pauseSpace') : t('playSpace')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={next}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/80 hover:text-foreground transition-colors"
            aria-label={t('next')}
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top">{t('nextTooltip')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={cycleRepeatMode}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200',
              repeatMode !== 'off'
                ? 'text-primary'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
            aria-label={t('repeatAria', { mode: repeatMode })}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {repeatMode === 'off' ? t('repeatOff') : repeatMode === 'all' ? t('repeatAll') : t('repeatOne')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
});
