import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersVertical } from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import {
  useEqStore,
  EQ_MIN_DB,
  EQ_MAX_DB,
  type EqPresetId,
  type NamedEqPresetId,
} from '@/stores/useEqStore';

const PREAMP_MIN_DB = -12;
const PREAMP_MAX_DB = 12;
const PREAMP_STEP = 0.5;
const BAND_STEP = 0.5;

const ORDERED_PRESETS: NamedEqPresetId[] = [
  'flat',
  'rock',
  'pop',
  'jazz',
  'classical',
  'electronic',
  'dance',
  'hiphop',
  'acoustic',
  'vocal',
  'bassboost',
  'trebleboost',
  'loudness',
];

function formatBandLabel(t: (key: string, opts?: Record<string, unknown>) => string, freq: number) {
  if (freq >= 1000) {
    return t('bandLabelKhz', { freq: freq / 1000 });
  }
  return t('bandLabel', { freq });
}

function formatGain(db: number) {
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

interface VerticalBandSliderProps {
  freq: number;
  value: number;
  onChange: (db: number) => void;
  disabled?: boolean;
  label: string;
  gainLabel: string;
  heightClass?: string;
}

function VerticalBandSlider({
  freq,
  value,
  onChange,
  disabled,
  label,
  gainLabel,
  heightClass = 'h-56',
}: VerticalBandSliderProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex-1 flex items-center justify-center', heightClass)}>
            <SliderPrimitive.Root
              orientation="vertical"
              min={EQ_MIN_DB}
              max={EQ_MAX_DB}
              step={BAND_STEP}
              value={[value]}
              onValueChange={([v]) => onChange(v)}
              disabled={disabled}
              aria-label={label}
              className={cn(
                'relative flex flex-col items-center justify-center touch-none select-none h-full',
                'group cursor-pointer',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <SliderPrimitive.Track className="relative w-1 h-full grow overflow-hidden rounded-full bg-foreground/15 group-hover:w-[5px] transition-all duration-200">
                <SliderPrimitive.Range className="absolute w-full bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200" />
              </SliderPrimitive.Track>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-px w-2.5 -translate-x-1/2 -translate-y-1/2 bg-foreground/25"
              />
              <SliderPrimitive.Thumb className="block h-3 w-3 rounded-full bg-primary shadow-md shadow-primary/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none" />
            </SliderPrimitive.Root>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="tabular-nums">
          {gainLabel}
        </TooltipContent>
      </Tooltip>
      <span className="text-[10px] text-muted-foreground/80 tabular-nums">
        {freq >= 1000 ? `${freq / 1000}k` : freq}
      </span>
    </div>
  );
}

interface EqualizerPanelProps {
  /** When true, renders vertical sliders at a larger size for the settings panel. */
  layout?: 'popover' | 'section';
  /** Omit the trigger + popover chrome and just render the controls. */
  inline?: boolean;
}

/**
 * Graphic EQ control surface — renders as a popover in the player bar by
 * default, or inline when `inline` is set (used by the settings section).
 */
export function EqualizerPanel({ layout = 'popover', inline = false }: EqualizerPanelProps = {}) {
  const { t } = useTranslation('equalizer');
  const { t: tPlayer } = useTranslation('player');
  const [open, setOpen] = useState(false);

  const enabled = useEqStore((s) => s.enabled);
  const preset = useEqStore((s) => s.preset);
  const gains = useEqStore((s) => s.gains);
  const preampDb = useEqStore((s) => s.preampDb);
  const setEnabled = useEqStore((s) => s.setEnabled);
  const setBandGain = useEqStore((s) => s.setBandGain);
  const setPreampDb = useEqStore((s) => s.setPreampDb);
  const applyPreset = useEqStore((s) => s.applyPreset);
  const reset = useEqStore((s) => s.reset);

  const active = enabled && preset !== 'flat';

  const presetOptions = useMemo(
    () => ORDERED_PRESETS.map((id) => ({ id, label: t(`preset.${id}`) })),
    [t],
  );

  const handlePresetChange = (value: string) => {
    if (value === 'custom') return;
    applyPreset(value as EqPresetId);
  };

  const controls = (
    <div className={cn('space-y-4', layout === 'section' && 'space-y-5')}>
      {/* Enable row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('enable')}</p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">{t('enableDesc')}</p>
        </div>
        <Switch checked={enabled} onChange={setEnabled} />
      </div>

      {/* Preset select */}
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs text-muted-foreground">{t('preset')}</label>
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="min-w-[140px]">
            <SelectValue placeholder={t('presetPlaceholder')}>
              {preset === 'custom' ? t('customPreset') : t(`preset.${preset}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {presetOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Band strip */}
      <div
        className={cn(
          'grid grid-cols-10 gap-1',
          layout === 'section' && 'gap-2',
          !enabled && 'opacity-60',
        )}
      >
        {EQ_BANDS.map((freq, i) => (
          <VerticalBandSlider
            key={freq}
            freq={freq}
            value={gains[i] ?? 0}
            onChange={(db) => setBandGain(i, db)}
            disabled={!enabled}
            label={formatBandLabel(t, freq)}
            gainLabel={t('gainLabel', { gain: formatGain(gains[i] ?? 0) })}
            heightClass={layout === 'section' ? 'h-64' : 'h-56'}
          />
        ))}
      </div>

      {/* Preamp */}
      <div className={cn(!enabled && 'opacity-60')}>
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <p className="text-xs font-medium text-foreground">{t('preamp')}</p>
            {layout === 'section' && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{t('preampDesc')}</p>
            )}
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t('gainLabel', { gain: formatGain(preampDb) })}
          </span>
        </div>
        <Slider
          min={PREAMP_MIN_DB}
          max={PREAMP_MAX_DB}
          step={PREAMP_STEP}
          value={[preampDb]}
          onValueChange={([v]) => setPreampDb(v)}
          disabled={!enabled}
          aria-label={t('preamp')}
        />
      </div>

      {/* Reset */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
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
            <button
              className={cn(
                'size-7 flex items-center justify-center rounded-lg transition-colors relative',
                active
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground/75 hover:bg-accent hover:text-foreground',
              )}
              aria-label={tPlayer('eqTooltip')}
            >
              <SlidersVertical className="w-3.5 h-3.5" />
              {active && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{tPlayer('eqTooltip')}</TooltipContent>
      </Tooltip>

      <PopoverContent side="top" align="center" className="w-[380px]">
        {controls}
      </PopoverContent>
    </Popover>
  );
}
