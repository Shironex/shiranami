import type { LucideIcon } from 'lucide-react';

export interface IViewModeButtonProps {
  /** Whether this mode is the active one — drives the highlighted styling + aria-pressed. */
  readonly active: boolean;
  /** Invoked when the button is pressed to switch to this view mode. */
  readonly onClick: () => void;
  /** Lucide glyph rendered inside the button. */
  readonly icon: LucideIcon;
  /** Accessible label + tooltip describing the view mode. */
  readonly label: string;
}

export interface IViewModeButtonView {
  /** Composed button class string for the current active state. */
  readonly className: string;
}
