import type { ComponentType } from 'react';
import type { SidePanelSide } from '@/stores/useLayoutStore';

export interface ISidePanelProps {
  readonly side: SidePanelSide;
}

export interface ISidePanelView {
  /** Bound `common` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: (key: string) => string;
  /** Whether the panel renders at all — false when there is nothing to show. */
  readonly shouldRender: boolean;
  /** Which content the panel shows (only meaningful when `shouldRender`). */
  readonly content: 'lyrics' | 'queue' | null;
  /** Persisted shared width of the panel, in px. */
  readonly rightPanelWidth: number;
  /** The side the panel docks on (drives border + resize-handle edge). */
  readonly side: SidePanelSide;
  /** The opposite edge the resize handle attaches to. */
  readonly resizeEdge: SidePanelSide;
  /** Accessible label for the flip-side button. */
  readonly flipLabel: string;
  /** Icon for the flip-side button. */
  readonly FlipIcon: ComponentType<{ className?: string }>;
  /** Flip the panel to the opposite side. */
  readonly onFlip: () => void;
  /** Commit a new panel width. */
  readonly setRightPanelWidth: (v: number) => void;
  /** Reset the panel width to its default. */
  readonly resetRightPanelWidth: () => void;
}
