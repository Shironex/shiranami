export interface IEnrichConfidenceBadgeProps {
  /** Raw confidence score (0-1). When undefined/null the badge renders nothing. */
  readonly confidence: number | undefined | null;
  /** Optional extra classes merged onto the badge. */
  readonly className?: string;
}

export interface IEnrichConfidenceBadgeView {
  /** Whether the badge should render (a level was resolved from the score). */
  readonly visible: boolean;
  /** Token-backed color classes for the resolved confidence level. */
  readonly levelClassName: string;
  /** Localized label for the resolved confidence level. */
  readonly label: string;
  /** Optional extra classes merged onto the badge. */
  readonly className?: string;
}
