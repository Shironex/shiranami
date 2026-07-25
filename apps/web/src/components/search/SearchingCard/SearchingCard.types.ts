export interface ISearchingCardProps {
  /** The in-flight query, echoed back in the subtitle. */
  readonly query: string;
}

export interface ISearchingCardView {
  /** Localized "Searching YouTube" heading. */
  readonly title: string;
  /** Localized "Pulling the best matches for …" line, with the trimmed query. */
  readonly subtitle: string;
}
