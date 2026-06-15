import type { LucideIcon } from 'lucide-react';

export interface ISettingsHeaderProps {
  /** Leading section icon shown in the header. */
  readonly icon: LucideIcon;
  /** Section title. */
  readonly title: string;
  /** Optional section subtitle shown beneath the title. */
  readonly subtitle?: string;
}

export interface ISettingsHeaderView {
  /** Leading section icon shown in the header. */
  readonly icon: LucideIcon;
  /** Section title. */
  readonly title: string;
  /** Optional section subtitle shown beneath the title. */
  readonly subtitle?: string;
}
