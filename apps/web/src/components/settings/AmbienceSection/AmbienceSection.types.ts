export interface IAmbienceSectionView {
  readonly title: string;
  readonly subtitle: string;
  /** How ambience follows playback, crossfades and the sleep timer. */
  readonly sleepNote: string;
  /** Where the sounds come from (the café recording's provenance). */
  readonly credit: string;
}
