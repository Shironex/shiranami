export interface ITopBarPreviewProps {
  /** Whether the language switcher chip group is shown. */
  readonly enabled: boolean;
}

export interface ITopBarPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the language switcher chip group is shown. */
  readonly enabled: boolean;
}
