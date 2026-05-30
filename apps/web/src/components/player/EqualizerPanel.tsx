import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersVertical, Save, Pencil, Trash2 } from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import {
  useEqStore,
  EQ_MIN_DB,
  EQ_MAX_DB,
  EQ_PRESET_NAME_MAX,
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
  bandName: string;
  gainLabel: string;
  heightClass?: string;
}

function VerticalBandSlider({
  freq,
  value,
  onChange,
  disabled,
  label,
  bandName,
  gainLabel,
  heightClass = 'h-56',
}: VerticalBandSliderProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center justify-center shrink-0', heightClass)}>
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
        <TooltipContent side="top" className="text-center">
          <div className="font-medium">{bandName}</div>
          <div className="text-[11px] text-muted-foreground/80 tabular-nums mt-0.5">
            {gainLabel}
          </div>
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

  const enabled = useEqStore(s => s.enabled);
  const preset = useEqStore(s => s.preset);
  const gains = useEqStore(s => s.gains);
  const preampDb = useEqStore(s => s.preampDb);
  const customPresets = useEqStore(s => s.customPresets);
  const activeCustomId = useEqStore(s => s.activeCustomId);
  const setEnabled = useEqStore(s => s.setEnabled);
  const setBandGain = useEqStore(s => s.setBandGain);
  const setPreampDb = useEqStore(s => s.setPreampDb);
  const applyPreset = useEqStore(s => s.applyPreset);
  const applyCustomPreset = useEqStore(s => s.applyCustomPreset);
  const saveCustomPreset = useEqStore(s => s.saveCustomPreset);
  const renameCustomPreset = useEqStore(s => s.renameCustomPreset);
  const deleteCustomPreset = useEqStore(s => s.deleteCustomPreset);
  const reset = useEqStore(s => s.reset);

  // Save / rename dialog state. `mode` distinguishes the two flows; `targetId`
  // is the preset being renamed (null when saving a new one).
  const [nameDialog, setNameDialog] = useState<{
    mode: 'save' | 'rename';
    targetId: string | null;
    value: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const active = enabled && (preset !== 'flat' || activeCustomId !== null);

  const presetOptions = useMemo(
    () => ORDERED_PRESETS.map(id => ({ id, label: t(`preset.${id}`) })),
    [t]
  );

  // Select value: a user preset takes a `custom:<id>` value so it round-trips
  // through the same onValueChange handler as the built-ins.
  const selectValue = activeCustomId ? `custom:${activeCustomId}` : preset;

  const handlePresetChange = (value: string) => {
    if (value.startsWith('custom:')) {
      applyCustomPreset(value.slice('custom:'.length));
      return;
    }
    if (value === 'custom') return;
    applyPreset(value as EqPresetId);
  };

  const submitNameDialog = () => {
    if (!nameDialog) return;
    const trimmed = nameDialog.value.trim();
    if (!trimmed) return;
    if (nameDialog.mode === 'save') {
      saveCustomPreset(trimmed);
    } else if (nameDialog.targetId) {
      renameCustomPreset(nameDialog.targetId, trimmed);
    }
    setNameDialog(null);
  };

  const controls = (
    <div className={cn('space-y-4', layout === 'section' && 'space-y-5')}>
      {/* Enable row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('enable')}</p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">{t('enableDesc')}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Preset select */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="eq-preset" className="text-xs text-muted-foreground">
          {t('preset')}
        </label>
        <div className="flex items-center gap-1.5">
          <Select value={selectValue} onValueChange={handlePresetChange}>
            <SelectTrigger id="eq-preset" className="min-w-[140px]">
              <SelectValue placeholder={t('presetPlaceholder')}>
                {activeCustomId
                  ? (customPresets.find(p => p.id === activeCustomId)?.name ?? t('customPreset'))
                  : preset === 'custom'
                    ? t('customPreset')
                    : t(`preset.${preset}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t('customPresets.group')}</SelectLabel>
                {presetOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {customPresets.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{t('customPresets.userGroup')}</SelectLabel>
                  {customPresets.map(p => (
                    <SelectItem key={p.id} value={`custom:${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          {/* Rename / delete the active user preset */}
          {activeCustomId && (
            <>
              <IconButton
                aria-label={t('customPresets.rename')}
                onClick={() => {
                  const current = customPresets.find(p => p.id === activeCustomId);
                  setNameDialog({
                    mode: 'rename',
                    targetId: activeCustomId,
                    value: current?.name ?? '',
                  });
                }}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                aria-label={t('customPresets.delete')}
                onClick={() => {
                  const current = customPresets.find(p => p.id === activeCustomId);
                  if (current) setDeleteTarget({ id: current.id, name: current.name });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {/* Save current band settings as a named preset */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          disabled={!enabled}
          onClick={() => setNameDialog({ mode: 'save', targetId: null, value: '' })}
        >
          <Save className="h-3.5 w-3.5" />
          {t('customPresets.save')}
        </Button>
      </div>

      {/* Band strip with zone labels */}
      <div className={cn(!enabled && 'opacity-60')}>
        <div className={cn('grid grid-cols-10 gap-1', layout === 'section' && 'gap-2')}>
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
              heightClass={layout === 'section' ? 'h-64' : 'h-56'}
            />
          ))}
        </div>
        <div className={cn('grid grid-cols-10 mt-2', layout === 'section' && 'mt-2.5')}>
          <span className="col-span-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 border-t border-border/30 pt-1.5">
            {t('zone.bass')}
          </span>
          <span className="col-span-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 border-t border-border/30 pt-1.5 mx-1">
            {t('zone.mids')}
          </span>
          <span className="col-span-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 border-t border-border/30 pt-1.5">
            {t('zone.treble')}
          </span>
        </div>
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

  const dialogs = (
    <>
      {/* Save / rename preset */}
      <Dialog open={nameDialog !== null} onOpenChange={open => !open && setNameDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename'
                ? t('customPresets.renameTitle')
                : t('customPresets.saveTitle')}
            </DialogTitle>
            {nameDialog?.mode === 'save' && (
              <DialogDescription>{t('customPresets.saveDesc')}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="eq-preset-name" className="text-xs text-muted-foreground">
              {t('customPresets.nameLabel')}
            </label>
            <Input
              id="eq-preset-name"
              autoFocus
              maxLength={EQ_PRESET_NAME_MAX}
              value={nameDialog?.value ?? ''}
              placeholder={t('customPresets.namePlaceholder')}
              onChange={e => setNameDialog(d => (d ? { ...d, value: e.target.value } : d))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitNameDialog();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNameDialog(null)}>
              {t('customPresets.cancel')}
            </Button>
            <Button onClick={submitNameDialog} disabled={!nameDialog?.value.trim()}>
              {t('customPresets.confirmSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete preset confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('customPresets.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('customPresets.deleteDesc', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('customPresets.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteCustomPreset(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {t('customPresets.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (inline)
    return (
      <>
        {controls}
        {dialogs}
      </>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <IconButton
              className={cn(
                'relative',
                active && 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary'
              )}
              aria-label={tPlayer('eqTooltip')}
            >
              <SlidersVertical />
              {active && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </IconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{tPlayer('eqTooltip')}</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="center"
        className="w-[380px]"
        onInteractOutside={e => {
          // Keep the popover open while a save/delete dialog spawned from
          // within it is active — Radix treats dialog interaction as outside.
          if (nameDialog !== null || deleteTarget !== null) {
            e.preventDefault();
          }
        }}
      >
        {controls}
      </PopoverContent>
      {dialogs}
    </Popover>
  );
}
