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
import { IconButton } from '@/components/ui/icon-button';

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
          <IconButton
            size="md"
            onClick={toggleShuffle}
            className={cn(
              '[&_svg]:size-3.5',
              isShuffled
                ? 'text-primary hover:bg-transparent hover:text-primary'
                : 'text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground'
            )}
            aria-label={t('shuffle')}
          >
            <Shuffle />
          </IconButton>
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
              // rest: outlined accent ring, transparent fill, accent glyph + glow
              'border-2 border-primary text-primary bg-transparent',
              'shadow-[0_0_16px_-2px_rgba(var(--primary-rgb),0.5)]',
              // hover/active: fill for affordance + glyph contrast
              'hover:bg-primary hover:text-primary-foreground hover:border-primary',
              'hover:shadow-[0_0_22px_-2px_rgba(var(--primary-rgb),0.6)]',
              'transition-colors duration-200',
              'disabled:opacity-50'
            )}
            aria-label={isPlaying ? t('pause') : t('play')}
          >
            <AnimatePresence mode="wait" initial={false}>
              {showLoading ? (
                <motion.div
                  key="loading"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                </motion.div>
              ) : isPlaying ? (
                <motion.div
                  key="pause"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <Pause className="w-4.5 h-4.5 fill-current" />
                </motion.div>
              ) : (
                <motion.div
                  key="play"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.12 }}
                >
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
          <IconButton
            size="md"
            onClick={cycleRepeatMode}
            className={cn(
              '[&_svg]:size-3.5',
              repeatMode !== 'off'
                ? 'text-primary hover:bg-transparent hover:text-primary'
                : 'text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground'
            )}
            aria-label={t('repeatAria', { mode: repeatMode })}
          >
            {repeatMode === 'one' ? <Repeat1 /> : <Repeat />}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="top">
          {repeatMode === 'off'
            ? t('repeatOff')
            : repeatMode === 'all'
              ? t('repeatAll')
              : t('repeatOne')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
});
