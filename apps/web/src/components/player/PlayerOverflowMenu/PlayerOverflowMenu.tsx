import { MoreHorizontal, Minimize2, AudioLines } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { SleepTimer } from '../SleepTimer';
import { EqualizerPanel } from '../EqualizerPanel';
import { usePlayerOverflowMenu } from './PlayerOverflowMenu.hooks';

/**
 * Secondary player controls (sleep timer, EQ, compact mode, visualizer) collapsed
 * into a single "more" popover at narrow widths. Preserves each child's own
 * popover and active state.
 */
export default function PlayerOverflowMenu() {
  const {
    t,
    hasActive,
    showVisualizer,
    showSleepTimer,
    showEqualizer,
    showCompactButton,
    showVisualizerButton,
    compactTooltip,
    onEnterCompact,
    onToggleVisualizer,
  } = usePlayerOverflowMenu();

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <IconButton className="relative" aria-label={t('moreTooltip')}>
              <MoreHorizontal />
              {hasActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </IconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t('moreTooltip')}</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="end" className="w-auto p-1.5">
        <div className="flex items-center gap-0.5">
          {showSleepTimer && <SleepTimer />}
          {showEqualizer && <EqualizerPanel />}
          {showCompactButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton onClick={onEnterCompact} aria-label={t('compactMode')}>
                  <Minimize2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="top">{compactTooltip}</TooltipContent>
            </Tooltip>
          )}
          {showVisualizerButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={onToggleVisualizer}
                  className={cn(
                    showVisualizer &&
                      'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
                  )}
                  aria-label={t('toggleVisualizer')}
                >
                  <AudioLines />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="top">{t('visualizerTooltip')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
