import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Minimize2, AudioLines } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useEqStore } from '@/stores/useEqStore';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { SleepTimer } from './SleepTimer';
import { EqualizerPanel } from './EqualizerPanel';

const MOD = navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl';

/**
 * Secondary player controls (sleep timer, EQ, compact mode, visualizer) collapsed
 * into a single "more" popover at narrow widths. Preserves each child's own
 * popover and active state.
 */
export function PlayerOverflowMenu() {
  const { t } = useTranslation('player');
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const toggleVisualizer = useUIStore(s => s.toggleVisualizer);
  const setCompactMode = useCompactStore(s => s.setCompactMode);
  const eqEnabled = useEqStore(s => s.enabled);
  const eqPreset = useEqStore(s => s.preset);
  // Mirror the PlayerBar element toggles so a hidden control stays hidden in
  // the narrow-width overflow too. The parent renders this menu only when at
  // least one of the four is visible.
  const showSleepTimer = useInterfaceStore(s => s.playerSleepTimer);
  const showEqualizer = useInterfaceStore(s => s.playerEqualizer);
  const showCompactButton = useInterfaceStore(s => s.playerCompactButton);
  const showVisualizerButton = useInterfaceStore(s => s.playerVisualizerButton);

  const hasActive =
    (showVisualizerButton && showVisualizer) || (showEqualizer && eqEnabled && eqPreset !== 'flat');

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
                <IconButton onClick={() => void setCompactMode(true)} aria-label={t('compactMode')}>
                  <Minimize2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('compactModeTooltip', { shortcut: `${MOD}+Shift+M` })}
              </TooltipContent>
            </Tooltip>
          )}
          {showVisualizerButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  onClick={toggleVisualizer}
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
