export interface IResumePreviewProps {
  /** Whether playback position is remembered across relaunches. */
  readonly enabled: boolean;
}

export interface IResumePreviewView {
  /** Localized preview panel title. */
  readonly title: string;
  /** Localized mock track title. */
  readonly trackLabel: string;
  /** Saved position shown on the mock row (`0:00` when nothing is remembered). */
  readonly positionLabel: string;
  /** Progress-bar fill width as a CSS length. */
  readonly progressWidth: string;
  /** Localized caption explaining what the current setting does. */
  readonly caption: string;
}
