import { cn } from '@/lib/utils';
import type { IPreviewFrameProps, IPreviewFrameView, PreviewFrameSize } from './PreviewFrame.types';

/** The frosted panel every settings preview sits on. */
const FRAME_CLASSES = 'rounded-xl border border-border/30 bg-background/40 p-3';

/**
 * The shared canvas surface. Padding is intentionally left to callers: the
 * mocks mix `p-3`, `p-2`, and bar-style `px-3`, and tailwind-merge cannot
 * subtract an axis from a base `p-*`.
 */
const CANVAS_BASE_CLASSES =
  'relative mx-auto max-w-[360px] overflow-hidden rounded-xl border border-border/25 bg-surface/60';

const CANVAS_SIZE_CLASSES: Record<Exclude<PreviewFrameSize, 'none'>, string> = {
  scene: 'aspect-[5/2]',
  shell: 'aspect-[10/7]',
  auto: '',
};

/** Resolves the size preset + caller overrides into concrete class lists. */
export function usePreviewFrame({
  label,
  size = 'auto',
  className,
  canvasClassName,
  caption,
  children,
}: IPreviewFrameProps): IPreviewFrameView {
  return {
    label,
    frameClassName: cn(FRAME_CLASSES, className),
    canvasClassName:
      size === 'none' ? null : cn(CANVAS_BASE_CLASSES, CANVAS_SIZE_CLASSES[size], canvasClassName),
    caption,
    children,
  };
}
