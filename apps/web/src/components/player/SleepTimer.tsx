import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, TimerOff } from 'lucide-react';
import { pad2 } from '@shiranami/shared';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import {
  useSleepTimerStore,
  SLEEP_TIMER_PRESETS,
  SLEEP_TIMER_MIN_MINUTES,
  SLEEP_TIMER_MAX_MINUTES,
} from '@/stores/useSleepTimerStore';

// NOTE: intentionally NOT formatDuration from @shiranami/shared. The sleep
// timer caps at 600 minutes, so `remaining` exceeds an hour; formatDuration
// would render the 90-minute preset as "1:30:00" instead of the "90:00"
// minutes-only format this UI expects. Keep the local mm:ss formatter.
function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${pad2(s)}`;
}

export function SleepTimer() {
  const { t } = useTranslation('sleepTimer');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'custom') return;
    const el = customInputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      setCustomValue(prev => {
        const n = parseInt(prev, 10);
        const base = Number.isNaN(n) ? 0 : n;
        return String(
          Math.min(SLEEP_TIMER_MAX_MINUTES, Math.max(SLEEP_TIMER_MIN_MINUTES, base + delta))
        );
      });
      setCustomError(false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mode]);

  const endTime = useSleepTimerStore(s => s.endTime);
  const remaining = useSleepTimerStore(s => s.remaining);
  const start = useSleepTimerStore(s => s.start);
  const cancel = useSleepTimerStore(s => s.cancel);

  const isActive = endTime !== null;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMode('presets');
      setCustomValue('');
      setCustomError(false);
    }
    setOpen(next);
  };

  const handleSelect = (minutes: number) => {
    start(minutes);
    setOpen(false);
  };

  const handleCancel = () => {
    cancel();
    setOpen(false);
  };

  const handleCustomSubmit = () => {
    // Number() + isInteger rejects partial/decimal input ("12abc", "12.5", "")
    // that parseInt would silently accept.
    const parsed = Number(customValue);
    if (
      !Number.isInteger(parsed) ||
      parsed < SLEEP_TIMER_MIN_MINUTES ||
      parsed > SLEEP_TIMER_MAX_MINUTES
    ) {
      setCustomError(true);
      return;
    }
    start(parsed);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <IconButton
              className={cn(
                'relative',
                isActive && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
              )}
              aria-label={t('label')}
            >
              {isActive ? <TimerOff /> : <Timer />}
              {isActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </IconButton>
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

          {mode === 'presets' ? (
            <div className="space-y-0.5">
              {SLEEP_TIMER_PRESETS.map(minutes => (
                <button
                  key={minutes}
                  onClick={() => handleSelect(minutes)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                    'hover:bg-accent/50 hover:text-foreground',
                    'text-muted-foreground'
                  )}
                >
                  {t('minutes', { count: minutes })}
                </button>
              ))}
              <button
                onClick={() => {
                  setMode('custom');
                  setCustomError(false);
                  setCustomValue('');
                }}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                  'hover:bg-accent/50 hover:text-foreground',
                  'text-muted-foreground'
                )}
              >
                {t('custom')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                ref={customInputRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={SLEEP_TIMER_MIN_MINUTES}
                max={SLEEP_TIMER_MAX_MINUTES}
                step={1}
                value={customValue}
                onChange={e => {
                  setCustomValue(e.target.value);
                  setCustomError(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCustomSubmit();
                }}
                placeholder={t('customPlaceholder')}
                aria-label={t('customLabel')}
                className="h-8 rounded-lg bg-accent/40 border-border/50 px-2.5 placeholder:text-muted-foreground/50 focus-visible:ring-primary/40"
              />
              {customError && <p className="text-[10px] text-red-400 px-1">{t('customError')}</p>}
              <div className="flex gap-1.5">
                <button
                  onClick={handleCustomSubmit}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {t('customStart')}
                </button>
                <button
                  onClick={() => {
                    setMode('presets');
                    setCustomError(false);
                    setCustomValue('');
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  {t('customBack')}
                </button>
              </div>
            </div>
          )}

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
