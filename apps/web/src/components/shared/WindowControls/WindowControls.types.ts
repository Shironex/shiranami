export interface IWindowControlsProps {
  /** Extra classes for the wrapper (e.g. corner padding per host). */
  readonly className?: string;
}

export interface IWindowControlsView {
  /** Bound `topbar` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: (key: string) => string;
  /** Whether the controls render at all — false outside the frameless Windows shell. */
  readonly visible: boolean;
  /** True when the window is maximized (toggles the maximize/restore glyph + label). */
  readonly isMaximized: boolean;
  /** Minimize the window. */
  readonly minimize: () => void;
  /** Toggle maximize/restore. */
  readonly maximize: () => void;
  /** Close the window (quits, matching the shell). */
  readonly close: () => void;
}
