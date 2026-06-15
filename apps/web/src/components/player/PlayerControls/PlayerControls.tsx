import { memo } from 'react';
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
import { usePlayerControls } from './PlayerControls.hooks';

function PlayerControls() {
  const {
    t,
    hasTrack,
    isPlaying,
    showLoading,
    isShuffled,
    repeatActive,
    repeatOne,
    repeatTooltip,
    shuffleTooltip,
    playPauseTooltip,
    playPauseLabel,
    repeatLabel,
    onTogglePlay,
    onNext,
    onPrevious,
    onToggleShuffle,
    onCycleRepeatMode,
  } = usePlayerControls();

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            size="md"
            onClick={onToggleShuffle}
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
        <TooltipContent side="top">{shuffleTooltip}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onPrevious}
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
            onClick={onTogglePlay}
            disabled={!hasTrack}
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
            aria-label={playPauseLabel}
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
        <TooltipContent side="top">{playPauseTooltip}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onNext}
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
            onClick={onCycleRepeatMode}
            className={cn(
              '[&_svg]:size-3.5',
              repeatActive
                ? 'text-primary hover:bg-transparent hover:text-primary'
                : 'text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground'
            )}
            aria-label={repeatLabel}
          >
            {repeatOne ? <Repeat1 /> : <Repeat />}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="top">{repeatTooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export default memo(PlayerControls);
