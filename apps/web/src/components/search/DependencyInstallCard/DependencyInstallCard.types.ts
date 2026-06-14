export type DependencyInstallStatus = 'idle' | 'downloading' | 'done' | 'error';

export interface IDependencyInstallCardProps {
  readonly ffmpegInstalled: boolean | undefined;
  readonly installStatus: DependencyInstallStatus;
  readonly installError: string | null;
  readonly isInstallInProgress: boolean;
  readonly installProgress: number;
  readonly installLabel: string;
  readonly onInstall: () => void;
}

export interface IDependencyInstallCardView {
  /** Bound `search` namespace translator (the shell stays free of `useTranslation`). */
  readonly title: string;
  /** Localized description — mentions both tools or yt-dlp only. */
  readonly description: string;
  /** Show the indeterminate/determinate install progress block. */
  readonly showProgress: boolean;
  /** Show the success confirmation (install finished). */
  readonly showSuccess: boolean;
  /** Show the install button + optional error message. */
  readonly showInstallButton: boolean;
  /** Localized "<label>... <n>%" progress caption. */
  readonly progressCaption: string;
  /** Localized success label. */
  readonly installedLabel: string;
  /** Localized install button label. */
  readonly installButtonLabel: string;
  /** Render the inline error message under the install button. */
  readonly showError: boolean;
}
