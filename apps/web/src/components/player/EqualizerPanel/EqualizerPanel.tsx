import { SlidersVertical, Save, Pencil, Trash2 } from 'lucide-react';
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
import { VerticalBandSlider } from '../VerticalBandSlider';
import { useEqualizerPanel } from './EqualizerPanel.hooks';
import type { IEqualizerPanelProps } from './EqualizerPanel.types';

/**
 * Graphic EQ control surface — renders as a popover in the player bar by
 * default, or inline when `inline` is set (used by the settings section).
 */
export default function EqualizerPanel(props: IEqualizerPanelProps) {
  const {
    t,
    tPlayer,
    layout,
    inline,
    enabled,
    active,
    preampDb,
    preampLabel,
    preampMin,
    preampMax,
    preampStep,
    bandHeightClass,
    selectValue,
    selectTriggerLabel,
    presetOptions,
    userPresetOptions,
    hasUserPresets,
    activeCustomId,
    nameMaxLength,
    bandRows,
    nameDialog,
    deleteTarget,
    open,
    setOpen,
    onToggleEnabled,
    onBandChange,
    onPreampChange,
    onPresetChange,
    onReset,
    onOpenSaveDialog,
    onOpenRenameDialog,
    onOpenDeleteDialog,
    onNameDraftChange,
    onSubmitNameDialog,
    onCloseNameDialog,
    onConfirmDelete,
    onCloseDeleteDialog,
    shouldKeepPopoverOpen,
  } = useEqualizerPanel(props);

  // Lift list rendering out of JSX render position (declarative-JSX rule).
  const presetItems = presetOptions.map(opt => (
    <SelectItem key={opt.id} value={opt.id}>
      {opt.label}
    </SelectItem>
  ));

  const userPresetItems = userPresetOptions.map(opt => (
    <SelectItem key={opt.id} value={opt.id}>
      {opt.label}
    </SelectItem>
  ));

  const bandSliders = bandRows.map(row => (
    <VerticalBandSlider
      key={row.freq}
      freq={row.freq}
      value={row.value}
      onChange={db => onBandChange(row.index, db)}
      disabled={!enabled}
      label={row.label}
      bandName={row.bandName}
      gainLabel={row.gainLabel}
      heightClass={bandHeightClass}
    />
  ));

  const controls = (
    <div className={cn('space-y-4', layout === 'section' && 'space-y-5')}>
      {/* Enable row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('enable')}</p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">{t('enableDesc')}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
      </div>

      {/* Preset select */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="eq-preset" className="text-xs text-muted-foreground">
          {t('preset')}
        </label>
        <div className="flex items-center gap-1.5">
          <Select value={selectValue} onValueChange={onPresetChange}>
            <SelectTrigger id="eq-preset" className="min-w-[140px]">
              <SelectValue placeholder={t('presetPlaceholder')}>{selectTriggerLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t('customPresets.group')}</SelectLabel>
                {presetItems}
              </SelectGroup>
              {hasUserPresets && (
                <SelectGroup>
                  <SelectLabel>{t('customPresets.userGroup')}</SelectLabel>
                  {userPresetItems}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          {/* Rename / delete the active user preset */}
          {activeCustomId && (
            <>
              <IconButton aria-label={t('customPresets.rename')} onClick={onOpenRenameDialog}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton aria-label={t('customPresets.delete')} onClick={onOpenDeleteDialog}>
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
          onClick={onOpenSaveDialog}
        >
          <Save className="h-3.5 w-3.5" />
          {t('customPresets.save')}
        </Button>
      </div>

      {/* Band strip with zone labels */}
      <div className={cn(!enabled && 'opacity-60')}>
        <div className={cn('grid grid-cols-10 gap-1', layout === 'section' && 'gap-2')}>
          {bandSliders}
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
          <span className="text-[11px] tabular-nums text-muted-foreground">{preampLabel}</span>
        </div>
        <Slider
          min={preampMin}
          max={preampMax}
          step={preampStep}
          value={[preampDb]}
          onValueChange={([v]) => onPreampChange(v)}
          disabled={!enabled}
          aria-label={t('preamp')}
        />
      </div>

      {/* Reset */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="focus-ring text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          {t('reset')}
        </button>
      </div>
    </div>
  );

  const dialogs = (
    <>
      {/* Save / rename preset */}
      <Dialog open={nameDialog !== null} onOpenChange={open => !open && onCloseNameDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename'
                ? t('customPresets.renameTitle')
                : t('customPresets.saveTitle')}
            </DialogTitle>
            <DialogDescription>
              {nameDialog?.mode === 'rename'
                ? t('customPresets.renameDesc')
                : t('customPresets.saveDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="eq-preset-name" className="text-xs text-muted-foreground">
              {t('customPresets.nameLabel')}
            </label>
            <Input
              id="eq-preset-name"
              autoFocus
              maxLength={nameMaxLength}
              value={nameDialog?.value ?? ''}
              placeholder={t('customPresets.namePlaceholder')}
              onChange={e => onNameDraftChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmitNameDialog();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onCloseNameDialog}>
              {t('customPresets.cancel')}
            </Button>
            <Button onClick={onSubmitNameDialog} disabled={!nameDialog?.value.trim()}>
              {t('customPresets.confirmSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete preset confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={open => !open && onCloseDeleteDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('customPresets.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('customPresets.deleteDesc', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={onCloseDeleteDialog}>
              {t('customPresets.cancel')}
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete}>
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
          if (shouldKeepPopoverOpen()) {
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
