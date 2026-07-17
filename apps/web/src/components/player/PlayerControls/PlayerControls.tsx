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
import { iconButtonVariants } from '@/components/ui/icon-button';
import { SPRING_SNAPPY } from '@/lib/motion';
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
    shuffleControls,
    repeatControls,
    glowKey,
    showStartGlow,
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
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={onToggleShuffle}
            className={cn(
              iconButtonVariants({ size: 'md' }),
              '[&_svg]:size-3.5',
              isShuffled
                ? 'text-primary hover:bg-transparent hover:text-primary'
                : 'text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground'
            )}
            aria-label={t('shuffle')}
          >
            <motion.span animate={shuffleControls} className="inline-flex">
              <Shuffle />
            </motion.span>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top">{shuffleTooltip}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.08 }}
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
              'relative w-10 h-10 flex items-center justify-center rounded-full',
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
            {/* One-shot ring-glow pulse emitted when playback starts. Kept on a
                dedicated layer so it never clobbers the button's own rest/hover
                box-shadow. */}
            {showStartGlow && (
              <motion.span
                key={glowKey}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full"
                initial={{ opacity: 0.7, boxShadow: '0 0 0 0 rgba(var(--primary-rgb), 0.55)' }}
                animate={{ opacity: 0, boxShadow: '0 0 24px 6px rgba(var(--primary-rgb), 0)' }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              />
            )}
            <AnimatePresence mode="wait" initial={false}>
              {showLoading ? (
                <motion.div
                  key="loading"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={SPRING_SNAPPY}
                >
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                </motion.div>
              ) : isPlaying ? (
                <motion.div
                  key="pause"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={SPRING_SNAPPY}
                >
                  <Pause className="w-4.5 h-4.5 fill-current" />
                </motion.div>
              ) : (
                <motion.div
                  key="play"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={SPRING_SNAPPY}
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
            whileHover={{ scale: 1.08 }}
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
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={onCycleRepeatMode}
            className={cn(
              iconButtonVariants({ size: 'md' }),
              '[&_svg]:size-3.5',
              repeatActive
                ? 'text-primary hover:bg-transparent hover:text-primary'
                : 'text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground'
            )}
            aria-label={repeatLabel}
          >
            <motion.span animate={repeatControls} className="inline-flex">
              {repeatOne ? <Repeat1 /> : <Repeat />}
            </motion.span>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top">{repeatTooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export default memo(PlayerControls);
