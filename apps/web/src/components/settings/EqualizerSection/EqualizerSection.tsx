import { SlidersHorizontal } from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { EqCurvePreview } from '@/components/settings/EqCurvePreview';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatEqFrequencyTick } from '@/lib/eqLabels';
import { useEqualizerSection, EQ_BAND_BOUNDS } from './EqualizerSection.hooks';

interface IVerticalBandSliderProps {
  freq: number;
  value: number;
  onChange: (db: number) => void;
  disabled?: boolean;
  label: string;
  bandName: string;
  gainLabel: string;
}

function VerticalBandSlider({
  freq,
  value,
  onChange,
  disabled,
  label,
  bandName,
  gainLabel,
}: IVerticalBandSliderProps) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center shrink-0 h-64">
            <SliderPrimitive.Root
              orientation="vertical"
              min={EQ_BAND_BOUNDS.min}
              max={EQ_BAND_BOUNDS.max}
              step={EQ_BAND_BOUNDS.step}
              value={[value]}
              onValueChange={([v]) => onChange(v)}
              disabled={disabled}
              aria-label={label}
              className={cn(
                'relative flex flex-col items-center justify-center touch-none select-none h-full',
                'group cursor-pointer',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <SliderPrimitive.Track className="relative w-1.5 h-full grow overflow-hidden rounded-full bg-foreground/15 group-hover:w-2 transition-all duration-200">
                <SliderPrimitive.Range className="absolute w-full bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200" />
              </SliderPrimitive.Track>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-foreground/25"
              />
              <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full bg-primary shadow-md shadow-primary/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none" />
            </SliderPrimitive.Root>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-center">
          <div className="font-medium">{bandName}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{gainLabel}</div>
        </TooltipContent>
      </Tooltip>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {formatEqFrequencyTick(freq)}
      </span>
    </div>
  );
}

export default function EqualizerSection() {
  const {
    title,
    subtitle,
    enabled,
    onSetEnabled,
    enableLabel,
    enableDescription,
    presetLabel,
    presetTiles,
    isCustomPreset,
    customPresetLabel,
    onApplyPreset,
    curvePreviewTitle,
    gains,
    preampDb,
    bands,
    bassZoneLabel,
    midsZoneLabel,
    trebleZoneLabel,
    onSetBandGain,
    preampLabel,
    preampDescription,
    preampGainLabel,
    preampMinLabel,
    preampMaxLabel,
    preampMin,
    preampMax,
    preampStep,
    onSetPreampDb,
    resetLabel,
    onReset,
  } = useEqualizerSection();

  const presetButtons = presetTiles.map(tile => (
    <button
      key={tile.id}
      type="button"
      onClick={() => onApplyPreset(tile.id)}
      className={cn(
        'px-3 py-2 rounded-lg border text-center text-xs font-medium transition-all',
        tile.selected
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-accent/30 hover:text-foreground/80'
      )}
    >
      {tile.label}
    </button>
  ));

  const bandSliders = bands.map(band => (
    <VerticalBandSlider
      key={band.freq}
      freq={band.freq}
      value={band.value}
      onChange={db => onSetBandGain(band.index, db)}
      disabled={!enabled}
      label={band.label}
      bandName={band.bandName}
      gainLabel={band.gainLabel}
    />
  ));

  return (
    <SettingsCard icon={SlidersHorizontal} title={title} subtitle={subtitle}>
      <div className="space-y-5">
        {/* Enable switch */}
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">{enableLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{enableDescription}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={onSetEnabled} />
        </div>

        {/* Preset tiles */}
        <div className="px-3">
          <p className="text-xs text-muted-foreground mb-3">{presetLabel}</p>
          <div className="grid grid-cols-3 gap-2">
            {presetButtons}
            {isCustomPreset && (
              <div
                className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-center text-xs font-medium text-foreground"
                aria-live="polite"
              >
                {customPresetLabel}
              </div>
            )}
          </div>
        </div>

        {/* Response curve — reflects the resulting frequency response live, so
            presets read as distinct shapes, not just different slider heights.
            tone="info" marks it as a reflection rather than a control. */}
        <div className="px-3">
          <SettingsCard tone="info" className="!p-3">
            <SettingsPreview title={curvePreviewTitle}>
              <EqCurvePreview gains={gains} preampDb={preampDb} disabled={!enabled} />
            </SettingsPreview>
          </SettingsCard>
        </div>

        {/* Band strip with zone labels */}
        <div className={cn('px-3', !enabled && 'opacity-60')}>
          <div className="grid grid-cols-10 gap-2">{bandSliders}</div>
          <div className="grid grid-cols-10 mt-2.5">
            <span className="col-span-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/30 pt-1.5">
              {bassZoneLabel}
            </span>
            <span className="col-span-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/30 pt-1.5 mx-1">
              {midsZoneLabel}
            </span>
            <span className="col-span-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/30 pt-1.5">
              {trebleZoneLabel}
            </span>
          </div>
        </div>

        {/* Preamp */}
        <div className={cn('px-3 py-3 rounded-xl', !enabled && 'opacity-60')}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-foreground">{preampLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{preampDescription}</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{preampGainLabel}</span>
          </div>
          <Slider
            min={preampMin}
            max={preampMax}
            step={preampStep}
            value={[preampDb]}
            onValueChange={([v]) => onSetPreampDb(v)}
            disabled={!enabled}
            aria-label={preampLabel}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{preampMinLabel}</span>
            <span className="text-[10px] text-muted-foreground">{preampMaxLabel}</span>
          </div>
        </div>

        {/* Reset */}
        <div className="px-3 flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="text-xs px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:border-border/50 transition-colors"
          >
            {resetLabel}
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}
