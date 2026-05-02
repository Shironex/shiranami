import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SettingsCardTone = 'default' | 'destructive' | 'warning';

interface SettingsCardProps {
  children?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  /**
   * Renders a fully custom node in place of the auto-generated icon tile.
   * Use when the icon slot needs to show something other than a Lucide icon
   * (e.g. a logo image). When both `icon` and `iconSlot` are provided,
   * `iconSlot` takes precedence.
   */
  iconSlot?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  /**
   * Optional accent for cards that signal danger or caution. `default` is
   * unchanged from the base card. `destructive` tints the surface and title
   * red (e.g. library danger zone). `warning` tints amber for irreversible
   * actions that aren't quite destructive (e.g. writing tags to disk).
   */
  tone?: SettingsCardTone;
}

const TONE_TILE: Record<SettingsCardTone, { bg: string; icon: string }> = {
  default: { bg: 'bg-primary/10', icon: 'text-primary' },
  destructive: { bg: 'bg-destructive/15', icon: 'text-destructive' },
  warning: { bg: 'bg-amber-500/15', icon: 'text-amber-500' },
};

const TONE_SURFACE: Record<SettingsCardTone, string> = {
  default: 'bg-surface/50 border-border/30',
  destructive: 'border-destructive/25 bg-destructive/[0.06]',
  warning: 'border-amber-500/25 bg-amber-500/[0.05]',
};

const TONE_TITLE: Record<SettingsCardTone, string> = {
  default: 'text-foreground',
  destructive: 'text-destructive',
  warning: 'text-foreground',
};

export function SettingsCard({
  children,
  className,
  icon: Icon,
  iconSlot,
  title,
  subtitle,
  headerRight,
  tone = 'default',
}: SettingsCardProps) {
  const tile = TONE_TILE[tone];
  const resolvedSlot =
    iconSlot ??
    (Icon ? (
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', tile.bg)}>
        <Icon className={cn('w-4 h-4', tile.icon)} />
      </div>
    ) : null);
  return (
    <div
      className={cn(
        'border rounded-2xl p-5',
        TONE_SURFACE[tone],
        children && 'space-y-4',
        className
      )}
    >
      {resolvedSlot && title && (
        <div className={cn('flex items-center gap-2.5', children && 'mb-3')}>
          {resolvedSlot}
          <div>
            <h3 className={cn('text-sm font-medium leading-tight', TONE_TITLE[tone])}>{title}</h3>
            {subtitle && <div className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</div>}
          </div>
          {headerRight && <div className="ml-auto">{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Row primitives ──────────────────────────────────────────────────
//
// Shared layout building blocks for settings panels. Callers compose these
// instead of duplicating the flex/gap/divider pattern in every section file.

export interface SettingsRowProps {
  children: ReactNode;
  className?: string;
  /** When true, renders a top divider line above the row. */
  divider?: boolean;
}

export function SettingsRow({ children, className, divider }: SettingsRowProps) {
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

export interface SettingsRowLabelProps {
  label: string;
  description?: string;
  htmlFor?: string;
  /** id applied to the label element for aria-labelledby wiring. */
  id?: string;
  className?: string;
}

export function SettingsRowLabel({
  label,
  description,
  htmlFor,
  id,
  className,
}: SettingsRowLabelProps) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <p id={id} className="text-sm font-medium text-foreground leading-snug">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </p>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{description}</p>
      )}
    </div>
  );
}

export interface SettingsToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  divider?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  divider,
  disabled,
  className,
}: SettingsToggleRowProps) {
  const labelId = useId();
  return (
    <SettingsRow divider={divider} className={className}>
      <SettingsRowLabel id={labelId} label={label} description={description} />
      <Switch
        aria-labelledby={labelId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingsRow>
  );
}

export interface SettingsSelectOption {
  value: string;
  label: string;
}

export interface SettingsSelectRowProps {
  label: string;
  description?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<SettingsSelectOption>;
  divider?: boolean;
  disabled?: boolean;
  className?: string;
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
}: SettingsSelectRowProps) {
  const labelId = useId();
  return (
    <SettingsRow divider={divider} className={className}>
      <SettingsRowLabel id={labelId} label={label} description={description} />
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-labelledby={labelId} className="w-36 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}
