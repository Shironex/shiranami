import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsCard } from './SettingsCard.hooks';
import type {
  ISettingsCardProps,
  ISettingsInfoCalloutProps,
  ISettingsRowLabelProps,
  ISettingsRowProps,
  ISettingsSelectRowProps,
  ISettingsToggleRowProps,
} from './SettingsCard.types';

export default function SettingsCard({
  children,
  className,
  icon: Icon,
  iconSlot,
  title,
  subtitle,
  headerRight,
  tone = 'default',
}: ISettingsCardProps) {
  const { tile, surfaceClass, titleClass } = useSettingsCard(tone);
  const iconTile = Icon ? (
    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', tile.bg)}>
      <Icon className={cn('w-4 h-4', tile.icon)} />
    </div>
  ) : null;
  const resolvedSlot = iconSlot ?? iconTile;
  const showHeader = Boolean(resolvedSlot && title);
  const header = showHeader ? (
    <div className={cn('flex items-center gap-2.5', children && 'mb-3')}>
      {resolvedSlot}
      <div>
        <h3 className={cn('text-sm font-medium leading-tight', titleClass)}>{title}</h3>
        {subtitle && <div className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</div>}
      </div>
      {headerRight && <div className="ml-auto">{headerRight}</div>}
    </div>
  ) : null;

  return (
    <div className={cn('border rounded-2xl p-5', surfaceClass, children && 'space-y-4', className)}>
      {header}
      {children}
    </div>
  );
}

// ── Row primitives ──────────────────────────────────────────────────
//
// Shared layout building blocks for settings panels. Callers compose these
// instead of duplicating the flex/gap/divider pattern in every section file.

export function SettingsRow({ children, className, divider }: ISettingsRowProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 py-3',
        divider && 'border-t border-border/30 pt-3.5 mt-3.5',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRowLabel({
  label,
  description,
  htmlFor,
  id,
  descriptionId,
  className,
}: ISettingsRowLabelProps) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <p id={id} className="text-sm font-medium text-foreground leading-snug">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </p>
      {description && (
        <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground leading-snug">
          {description}
        </p>
      )}
    </div>
  );
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  divider,
  disabled,
  className,
}: ISettingsToggleRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <SettingsRow divider={divider} className={className}>
      <SettingsRowLabel
        id={labelId}
        descriptionId={description ? descriptionId : undefined}
        label={label}
        description={description}
      />
      <Switch
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingsRow>
  );
}

export function SettingsSelectRow({
  label,
  description,
  value,
  onValueChange,
  options,
  divider,
  disabled,
  className,
}: ISettingsSelectRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  const optionItems = options.map(option => (
    <SelectItem key={option.value} value={option.value} className="text-xs">
      {option.label}
    </SelectItem>
  ));
  return (
    <SettingsRow divider={divider} className={className}>
      <SettingsRowLabel
        id={labelId}
        descriptionId={description ? descriptionId : undefined}
        label={label}
        description={description}
      />
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-describedby={description ? descriptionId : undefined}
          className="w-36 h-8 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{optionItems}</SelectContent>
      </Select>
    </SettingsRow>
  );
}

// ── Info callout ────────────────────────────────────────────────────
//
// Shared chrome for "system note" info boxes. Several settings sections
// re-inline the same icon+text pattern with subtly different colors;
// this normalises the padding, icon alignment, and type scale so the
// "note" voice looks identical everywhere.

export function SettingsInfoCallout({
  icon: Icon,
  iconClassName,
  align = 'start',
  as: Body = 'p',
  children,
}: ISettingsInfoCalloutProps) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-xl border border-border/30 bg-surface/50 p-4 text-xs text-muted-foreground leading-relaxed',
        align === 'center' ? 'items-center' : 'items-start'
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80', iconClassName)} />
      <Body>{children}</Body>
    </div>
  );
}
