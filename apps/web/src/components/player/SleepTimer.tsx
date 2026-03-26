import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, TimerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  useSleepTimerStore,
  SLEEP_TIMER_PRESETS,
} from '@/stores/useSleepTimerStore';

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SleepTimer() {
  const { t } = useTranslation('sleepTimer');
  const [open, setOpen] = useState(false);
  const endTime = useSleepTimerStore((s) => s.endTime);
  const remaining = useSleepTimerStore((s) => s.remaining);
  const start = useSleepTimerStore((s) => s.start);
  const cancel = useSleepTimerStore((s) => s.cancel);

  const isActive = endTime !== null;

  const handleSelect = (minutes: number) => {
    start(minutes);
    setOpen(false);
  };

  const handleCancel = () => {
    cancel();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'size-7 flex items-center justify-center rounded-lg transition-colors relative',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground/75 hover:bg-accent hover:text-foreground',
              )}
              aria-label={t('label')}
            >
              {isActive ? (
                <TimerOff className="w-3.5 h-3.5" />
              ) : (
                <Timer className="w-3.5 h-3.5" />
              )}
              {isActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isActive ? t('sleepIn', { time: formatRemaining(remaining) }) : t('label')}
        </TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="center" className="w-48">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground px-1">
            {isActive ? t('active') : t('stopAfter')}
          </p>

          {isActive && (
            <div className="px-1 pb-1">
              <p className="text-lg font-semibold text-primary tabular-nums">
                {formatRemaining(remaining)}
              </p>
              <p className="text-[10px] text-muted-foreground">{t('remaining')}</p>
            </div>
          )}

          <div className="space-y-0.5">
            {SLEEP_TIMER_PRESETS.map((minutes) => (
              <button
                key={minutes}
                onClick={() => handleSelect(minutes)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                  'hover:bg-accent/50 hover:text-foreground',
                  'text-muted-foreground',
                )}
              >
                {t('minutes', { count: minutes })}
              </button>
            ))}
          </div>

          {isActive && (
            <button
              onClick={handleCancel}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {t('cancelTimer')}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
