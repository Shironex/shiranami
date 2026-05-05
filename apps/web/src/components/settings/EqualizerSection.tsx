import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import { useEqStore, EQ_MIN_DB, EQ_MAX_DB, type NamedEqPresetId } from '@/stores/useEqStore';

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
  if (freq >= 1000) return t('bandLabelKhz', { freq: freq / 1000 });
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
}: VerticalBandSliderProps) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center shrink-0 h-64">
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
        {freq >= 1000 ? `${freq / 1000}k` : freq}
      </span>
    </div>
  );
}

export function EqualizerSection() {
  const { t } = useTranslation('equalizer');

  const enabled = useEqStore(s => s.enabled);
  const preset = useEqStore(s => s.preset);
  const gains = useEqStore(s => s.gains);
  const preampDb = useEqStore(s => s.preampDb);
  const setEnabled = useEqStore(s => s.setEnabled);
  const setBandGain = useEqStore(s => s.setBandGain);
  const setPreampDb = useEqStore(s => s.setPreampDb);
  const applyPreset = useEqStore(s => s.applyPreset);
  const reset = useEqStore(s => s.reset);

  const presetTiles = useMemo(
    () => ORDERED_PRESETS.map(id => ({ id, label: t(`preset.${id}`) })),
    [t]
  );

  return (
    <SettingsCard icon={SlidersHorizontal} title={t('title')} subtitle={t('subtitle')}>
      <div className="space-y-5">
        {/* Enable switch */}
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">{t('enable')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('enableDesc')}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Preset tiles */}
        <div className="px-3">
          <p className="text-xs text-muted-foreground mb-3">{t('preset')}</p>
          <div className="grid grid-cols-3 gap-2">
            {presetTiles.map(tile => {
              const selected = preset === tile.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => applyPreset(tile.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-center text-xs font-medium transition-all',
                    selected
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-accent/30 hover:text-foreground/80'
                  )}
                >
                  {tile.label}
                </button>
              );
            })}
            {preset === 'custom' && (
              <div
                className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-center text-xs font-medium text-foreground"
                aria-live="polite"
              >
                {t('customPreset')}
              </div>
            )}
          </div>
        </div>

        {/* Band strip with zone labels */}
        <div className={cn('px-3', !enabled && 'opacity-60')}>
          <div className="grid grid-cols-10 gap-2">
            {EQ_BANDS.map((freq, i) => (
              <VerticalBandSlider
                key={freq}
                freq={freq}
                value={gains[i] ?? 0}
                onChange={db => setBandGain(i, db)}
                disabled={!enabled}
                label={formatBandLabel(t, freq)}
                bandName={t(`bandName.${freq}`)}
                gainLabel={t('gainLabel', { gain: formatGain(gains[i] ?? 0) })}
              />
            ))}
          </div>
          <div className="grid grid-cols-10 mt-2.5">
            <span className="col-span-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/30 pt-1.5">
              {t('zone.bass')}
            </span>
            <span className="col-span-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/30 pt-1.5 mx-1">
              {t('zone.mids')}
            </span>
            <span className="col-span-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/30 pt-1.5">
              {t('zone.treble')}
            </span>
          </div>
        </div>

        {/* Preamp */}
        <div className={cn('px-3 py-3 rounded-xl', !enabled && 'opacity-60')}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-foreground">{t('preamp')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('preampDesc')}</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
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
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">
              {t('gainLabel', { gain: PREAMP_MIN_DB })}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t('gainLabel', { gain: `+${PREAMP_MAX_DB}` })}
            </span>
          </div>
        </div>

        {/* Reset */}
        <div className="px-3 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="text-xs px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:border-border/50 transition-colors"
          >
            {t('reset')}
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}
