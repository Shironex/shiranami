export interface ISplashMetaProps {
  /** App version string from useAppVersionQuery. */
  readonly version: string;
  /** Locale-formatted current time. */
  readonly clock: string;
}

export interface ISplashMetaView {
  /** `v{version} · 白波`, or the bare brand kanji before the version resolves. */
  readonly buildLabel: string;
  /** Locale-formatted current time. */
  readonly clock: string;
}
