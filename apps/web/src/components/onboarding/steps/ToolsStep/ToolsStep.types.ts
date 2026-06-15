import type { useTranslation } from 'react-i18next';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** The install affordance shown once a missing tool is detected. */
export type ToolsInstallAffordance =
  | { readonly kind: 'progress'; readonly percent: number; readonly caption: string }
  | { readonly kind: 'button'; readonly onInstall: () => void };

/** Render-ready data for one tool's status row. */
export interface IToolStatusRowData {
  /** Whether the tool is installed. */
  readonly installed: boolean;
  /** Title shown when installed. */
  readonly installedTitle: string;
  /** Title shown when not installed. */
  readonly notInstalledTitle: string;
  /** Whether an update is available for the installed tool. */
  readonly updateAvailable: boolean;
  /** Optional right-aligned hint shown when not installed. */
  readonly notInstalledRight?: string;
}

export interface IToolsStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Whether this is the desktop build (tools only install on desktop). */
  readonly isDesktop: boolean;
  /** Whether the tool-status check is still in flight (show the skeleton). */
  readonly isChecking: boolean;
  /** Whether any required tool is missing (show the installer affordance). */
  readonly hasMissingTools: boolean;
  /** Render-ready yt-dlp + ffmpeg status rows. */
  readonly statusRows: readonly IToolStatusRowData[];
  /** The install affordance to render when a tool is missing. */
  readonly installAffordance: ToolsInstallAffordance;
}
