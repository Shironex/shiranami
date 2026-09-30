import { CloudRain, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useAmbienceMixer } from './AmbienceMixer.hooks';
import type { IAmbienceMixerProps } from './AmbienceMixer.types';

/**
 * The ambience mixer: a master switch, one volume slider per layer (rain,
 * vinyl crackle, warm noise, fireplace, café) and the two behaviour options.
 * Renders as a popover in the player bar by default, or inline when `inline`
 * is set (used by the settings section).
 */
export default function AmbienceMixer(props: IAmbienceMixerProps) {
  const {
    t,
    inline,
    open,
    setOpen,
    enabled,
    layerRows,
    sliderStep,
    keepWhenPaused,
    followWeather,
    weatherAvailable,
    ids,
    onToggleEnabled,
    onLevelChange,
    onToggleKeepWhenPaused,
    onToggleFollowWeather,
    onReset,
  } = useAmbienceMixer(props);

  const layerSliders = layerRows.map(row => (
    <li key={row.id} className="flex items-center gap-3">
      <row.Icon aria-hidden className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 truncate text-xs text-foreground/90">{row.label}</span>
      <Slider
        min={0}
        max={1}
        step={sliderStep}
        value={[row.value]}
        onValueChange={([v]) => onLevelChange(row.id, v)}
        aria-label={row.sliderLabel}
        className="flex-1"
      />
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {row.percentLabel}
      </span>
    </li>
  ));

  const controls = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label htmlFor={ids.enable} className="text-sm font-medium text-foreground">
            {t('enable')}
          </label>
          <p id={ids.enableDesc} className="text-xs text-muted-foreground mt-0.5">
            {t('enableDesc')}
          </p>
        </div>
        <Switch
          id={ids.enable}
          aria-describedby={ids.enableDesc}
          checked={enabled}
          onCheckedChange={onToggleEnabled}
        />
      </div>

      <div className={cn('space-y-2.5', !enabled && 'opacity-60')}>
        <p id={ids.layers} className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {t('layersLabel')}
        </p>
        <ul aria-labelledby={ids.layers} className="space-y-2.5">
          {layerSliders}
        </ul>
      </div>

      <div className="space-y-3 border-t border-border/30 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label htmlFor={ids.keep} className="text-xs font-medium text-foreground">
              {t('keepWhenPaused')}
            </label>
            <p id={ids.keepDesc} className="text-[11px] text-muted-foreground mt-0.5">
              {t('keepWhenPausedDesc')}
            </p>
          </div>
          <Switch
            id={ids.keep}
            aria-describedby={ids.keepDesc}
            checked={keepWhenPaused}
            onCheckedChange={onToggleKeepWhenPaused}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <label htmlFor={ids.follow} className="text-xs font-medium text-foreground">
              {t('followWeather')}
            </label>
            <p id={ids.followDesc} className="text-[11px] text-muted-foreground mt-0.5">
              {weatherAvailable ? t('followWeatherDesc') : t('followWeatherOff')}
            </p>
          </div>
          <Switch
            id={ids.follow}
            aria-describedby={ids.followDesc}
            checked={weatherAvailable ? followWeather : false}
            onCheckedChange={onToggleFollowWeather}
            disabled={!weatherAvailable}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="focus-ring inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          <RotateCcw aria-hidden className="w-3 h-3" />
          {t('reset')}
        </button>
      </div>
    </div>
  );

  if (inline) return controls;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <IconButton
              className={cn(
                enabled && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
              )}
              aria-label={t('trigger')}
            >
              <CloudRain />
            </IconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t('trigger')}</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="center" className="w-[320px]" aria-label={t('title')}>
        {controls}
      </PopoverContent>
    </Popover>
  );
}
