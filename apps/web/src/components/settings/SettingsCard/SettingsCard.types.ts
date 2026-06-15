import type { ElementType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ISettingsCardTone = 'default' | 'destructive' | 'warning' | 'info';

export interface ISettingsCardProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly icon?: LucideIcon;
  /**
   * Renders a fully custom node in place of the auto-generated icon tile.
   * Use when the icon slot needs to show something other than a Lucide icon
   * (e.g. a logo image). When both `icon` and `iconSlot` are provided,
   * `iconSlot` takes precedence.
   */
  readonly iconSlot?: ReactNode;
  readonly title?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly headerRight?: ReactNode;
  /**
   * Optional accent for cards that signal danger or caution. `default` is
   * unchanged from the base card. `destructive` tints the surface and title
   * red (e.g. library danger zone). `warning` tints amber for irreversible
   * actions that aren't quite destructive (e.g. writing tags to disk).
   * `info` tints blue — use on preview cards so "tinted = this reflects your
   * setting, not a control" becomes a learnable visual convention.
   */
  readonly tone?: ISettingsCardTone;
}

export interface ISettingsRowProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** When true, renders a top divider line above the row. */
  readonly divider?: boolean;
}

export interface ISettingsRowLabelProps {
  readonly label: string;
  readonly description?: string;
  readonly htmlFor?: string;
  /** id applied to the label element for aria-labelledby wiring. */
  readonly id?: string;
  /** id applied to the description element for aria-describedby wiring. */
  readonly descriptionId?: string;
  readonly className?: string;
}

export interface ISettingsToggleRowProps {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly divider?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

export interface ISettingsSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface ISettingsSelectRowProps {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: ReadonlyArray<ISettingsSelectOption>;
  readonly divider?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

export interface ISettingsInfoCalloutProps {
  /** Leading icon component (e.g. `Info`). */
  readonly icon: LucideIcon;
  /** Extra classes forwarded to the icon element — controls size and tint. */
  readonly iconClassName?: string;
  /** Vertical alignment of the icon against the body text. */
  readonly align?: 'center' | 'start';
  /** Wrapper element for the body — `<p>` by default, `<span>` for inline `<Trans>` usage. */
  readonly as?: ElementType;
  readonly children: ReactNode;
}
