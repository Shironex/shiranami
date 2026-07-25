export interface ISearchErrorCardProps {
  /** The failure message to surface beneath the heading. */
  readonly error: string;
}

export interface ISearchErrorCardView {
  /** Localized "no results" heading shown above the failure message. */
  readonly title: string;
  /** The failure message to surface beneath the heading. */
  readonly error: string;
}
