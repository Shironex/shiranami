import { usePreviewFrame } from './PreviewFrame.hooks';
import type { IPreviewFrameProps } from './PreviewFrame.types';

/**
 * The one preview surface every settings mock sits on: a frosted frame, an
 * optional canvas with a preset geometry (`scene` / `shell` / `auto` / `none`),
 * and an optional caption slot — so every preview down a settings page shares
 * the same rhythm instead of hand-rolling the frame.
 */
export default function PreviewFrame(props: IPreviewFrameProps) {
  const { label, frameClassName, canvasClassName, caption, children } = usePreviewFrame(props);

  const labelled = label !== undefined;
  // With no canvas the frame itself is the announced image.
  const frameIsImage = labelled && canvasClassName === null;
  const hasCaption = caption !== undefined && caption !== null;

  return (
    <div
      className={frameClassName}
      role={frameIsImage ? 'img' : undefined}
      aria-label={frameIsImage ? label : undefined}
    >
      {canvasClassName === null ? (
        children
      ) : (
        <div
          className={canvasClassName}
          role={labelled ? 'img' : undefined}
          aria-label={labelled ? label : undefined}
        >
          {children}
        </div>
      )}
      {hasCaption && <p className="mt-2 text-[10px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
