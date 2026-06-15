import type { ReactNode } from 'react';

export interface IToolStatusRowProps {
  /** Whether the tool is installed (drives the icon and label branch). */
  readonly installed: boolean;
  /** Title shown when the tool is installed. */
  readonly installedTitle: string;
  /** Title shown when the tool is not installed. */
  readonly notInstalledTitle: string;
  /** Whether a newer version is available (installed branch only). */
  readonly updateAvailable: boolean;
  /** Optional trailing content shown in the not-installed branch (e.g. "Recommended"). */
  readonly notInstalledRight?: ReactNode;
}

export interface IToolStatusRowView {
  /** Whether the tool is installed (drives the icon and label branch). */
  readonly installed: boolean;
  /** Title shown when the tool is installed. */
  readonly installedTitle: string;
  /** Title shown when the tool is not installed. */
  readonly notInstalledTitle: string;
  /** Whether a newer version is available (installed branch only). */
  readonly updateAvailable: boolean;
  /** Optional trailing content shown in the not-installed branch. */
  readonly notInstalledRight?: ReactNode;
  /** Localized "Update available" status label. */
  readonly updateAvailableLabel: string;
  /** Localized "Up to date" status label. */
  readonly upToDateLabel: string;
}
