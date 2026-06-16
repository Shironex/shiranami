import type { ErrorInfo, ReactNode } from 'react';

export interface IErrorBoundaryProps {
  readonly children: ReactNode;
  readonly viewName?: string;
  readonly root?: boolean;
  /**
   * Render a minimal inline fallback instead of the full-page error card.
   * Use for small chrome surfaces (top bar, player bar, sidebar) where the
   * large card would blow out the layout if that surface crashes.
   */
  readonly compact?: boolean;
  readonly onReset?: () => void;
}

export interface IErrorBoundaryState {
  readonly error: Error | null;
  readonly errorInfo: ErrorInfo | null;
}

export interface IErrorBoundaryFallbackProps {
  readonly error: Error;
  readonly errorInfo: ErrorInfo | null;
  readonly viewName?: string;
  readonly root?: boolean;
  readonly compact?: boolean;
  readonly onReset: () => void;
}
