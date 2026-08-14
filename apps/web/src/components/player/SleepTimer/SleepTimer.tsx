import { MoonStar, Timer, TimerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { useSleepTimer } from './SleepTimer.hooks';

export default function SleepTimer() {
  const {
    t,
    open,
    mode,
    customValue,
    customError,
    customInputRef,
    isActive,
    isWindDown,
    stopModeLabel,
    remainingLabel,
    tooltipText,
    triggerLabel,
    presets,
    minMinutes,
    maxMinutes,
    windDownEnabled,
    windDownHint,
    windDownLengthChoices,
    onOpenChange,
    onSelectPreset,
    onSelectWindDown,
    onSelectStopAfter,
    onSelectWindDownLength,
    onCancel,
    onShowCustom,
    onShowPresets,
    onCustomChange,
    onCustomKeyDown,
    onCustomSubmit,
  } = useSleepTimer();

  const lengthChips = windDownLengthChoices.map(choice => (
    <button
      key={choice.minutes}
      onClick={() => onSelectWindDownLength(choice.minutes)}
      aria-pressed={choice.selected}
      aria-label={choice.ariaLabel}
      className={cn(
        'flex-1 px-1 py-0.5 rounded-md text-[10px] tabular-nums transition-colors',
        choice.selected
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground/70 hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {choice.label}
    </button>
  ));

  const presetButtons = presets.map(({ minutes, label }) => (
    <button
      key={minutes}
      onClick={() => onSelectPreset(minutes)}
      className={cn(
        'focus-ring w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
        'hover:bg-accent/50 hover:text-foreground',
        'text-muted-foreground'
      )}
    >
      {label}
    </button>
  ));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <IconButton
              className={cn(
                'relative',
                isActive && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
              )}
              aria-label={triggerLabel}
            >
              {isActive ? <TimerOff /> : <Timer />}
              {isActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </IconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipText}</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="center" className="w-48">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground px-1">
            {isActive ? (isWindDown ? t('windingDown') : t('active')) : t('stopAfter')}
          </p>

          {isActive && (
            <div className="px-1 pb-1">
              {stopModeLabel ? (
                <p className="text-sm font-semibold text-primary">{stopModeLabel}</p>
              ) : (
                <>
                  <p className="text-lg font-semibold text-primary tabular-nums">
                    {remainingLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('remaining')}</p>
                </>
              )}
            </div>
          )}

          {mode === 'presets' ? (
            <div className="space-y-0.5">
              {presetButtons}
              <button
                onClick={onShowCustom}
                className={cn(
                  'focus-ring w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                  'hover:bg-accent/50 hover:text-foreground',
                  'text-muted-foreground'
                )}
              >
                {t('custom')}
              </button>

              <div className="my-1 border-t border-border/40" aria-hidden="true" />

              <button
                onClick={() => onSelectStopAfter('track')}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                  'hover:bg-accent/50 hover:text-foreground',
                  'text-muted-foreground'
                )}
              >
                {t('endOfTrack')}
              </button>
              <button
                onClick={() => onSelectStopAfter('album')}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                  'hover:bg-accent/50 hover:text-foreground',
                  'text-muted-foreground'
                )}
              >
                {t('endOfAlbum')}
              </button>

              <div className="my-1 border-t border-border/40" aria-hidden="true" />

              <button
                onClick={onSelectWindDown}
                disabled={!windDownEnabled}
                className={cn(
                  'focus-ring w-full text-left px-2.5 py-1.5 rounded-lg transition-colors',
                  'hover:bg-accent/50',
                  'text-muted-foreground hover:text-foreground',
                  'disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
                )}
              >
                <span className="flex items-center gap-1.5 text-sm">
                  <MoonStar className="size-3.5 text-primary/70" aria-hidden="true" />
                  {t('windDown')}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground/60">
                  {windDownHint}
                </span>
              </button>

              <div
                className="flex items-center gap-1 px-2.5 pb-1 pt-0.5"
                role="group"
                aria-label={t('windDownLength')}
              >
                {lengthChips}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                ref={customInputRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={minMinutes}
                max={maxMinutes}
                step={1}
                value={customValue}
                onChange={onCustomChange}
                onKeyDown={onCustomKeyDown}
                placeholder={t('customPlaceholder')}
                aria-label={t('customLabel')}
                className="h-8 rounded-lg bg-accent/40 border-border/50 px-2.5 placeholder:text-muted-foreground/50 focus-visible:ring-primary/40"
              />
              {customError && (
                <p className="text-[10px] text-destructive px-1">{t('customError')}</p>
              )}
              <div className="flex gap-1.5">
                <button
                  onClick={onCustomSubmit}
                  className="focus-ring flex-1 px-2.5 py-1.5 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {t('customStart')}
                </button>
                <button
                  onClick={onShowPresets}
                  className="focus-ring flex-1 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  {t('customBack')}
                </button>
              </div>
            </div>
          )}

          {isActive && (
            <button
              onClick={onCancel}
              className="focus-ring w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              {t('cancelTimer')}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
