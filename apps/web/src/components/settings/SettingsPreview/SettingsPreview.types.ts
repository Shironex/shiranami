import type { ReactNode } from 'react';

export interface ISettingsPreviewProps {
  /** Uppercase caption shown above the preview surface. */
  readonly title: string;
  /** Preview content rendered beneath the caption. */
  readonly children: ReactNode;
}

export interface ISettingsPreviewView {
  /** Uppercase caption shown above the preview surface. */
  readonly title: string;
  /** Preview content rendered beneath the caption. */
  readonly children: ReactNode;
}
