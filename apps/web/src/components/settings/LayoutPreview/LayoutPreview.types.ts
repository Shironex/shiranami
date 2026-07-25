export interface ILayoutPreviewView {
  /** Localized preview panel title (also used as the aria-label). */
  readonly title: string;
  /** Whether the side panel mock docks left of the content area. */
  readonly sidePanelOnLeft: boolean;
  /** Whether the side panel mock docks right of the content area. */
  readonly sidePanelOnRight: boolean;
  /** Whether the visualizer strip mock sits above the content row. */
  readonly visualizerOnTop: boolean;
  /** Whether the visualizer strip mock sits below the content row. */
  readonly visualizerOnBottom: boolean;
  /** Fixed bar heights (%) for the visualizer strip mock. */
  readonly vizBarHeights: readonly number[];
}
