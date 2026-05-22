import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TrackThumbnailProps {
  /** Album art URL; renders the fallback when absent. */
  albumArt?: string | null;
  /** `alt` for the cover image. */
  alt: string;
  /** Node shown when there's no album art (icon, EqBars, etc.). */
  fallback: ReactNode;
  /**
   * When true, render only the `<img>`/fallback so the caller can supply its
   * own (animated / clickable) wrapper element. The image fills the parent.
   * When false (default), wrap in a centered, overflow-hidden box styled by
   * `className`.
   */
  fill?: boolean;
  /** Classes for the wrapper box (size/rounding/background). Ignored when `fill`. */
  className?: string;
  /** Extra classes merged onto the `<img>`. */
  imgClassName?: string;
}

/**
 * The album-art thumbnail block shared across player/shared track rows: a
 * fixed-square container that shows the cover image (lazy + async-decoded,
 * object-cover) or a caller-provided fallback. Consolidates the repeated
 * `albumArt ? <img …> : <fallback>` markup.
 */
export function TrackThumbnail({
  albumArt,
  alt,
  fallback,
  fill = false,
  className,
  imgClassName,
}: TrackThumbnailProps) {
  const inner = albumArt ? (
    <img
      src={albumArt}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('w-full h-full object-cover', imgClassName)}
    />
  ) : (
    fallback
  );

  if (fill) return <>{inner}</>;

  return (
    <div className={cn('flex items-center justify-center shrink-0 overflow-hidden', className)}>
      {inner}
    </div>
  );
}
