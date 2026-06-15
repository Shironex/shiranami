export interface IToolVersionBlockProps {
  /** Installed version text (already formatted, e.g. "v2024.03.10"). */
  readonly installedVersion: string;
  /** Latest available version text, or null/undefined when unknown. */
  readonly latestVersion: string | null | undefined;
}

export interface IToolVersionBlockView {
  /** Installed version text (already formatted). */
  readonly installedVersion: string;
  /** Latest available version text, or null/undefined when unknown. */
  readonly latestVersion: string | null | undefined;
  /** Localized "Installed version" label. */
  readonly installedVersionLabel: string;
  /** Localized "Latest release" label. */
  readonly latestReleaseLabel: string;
}
