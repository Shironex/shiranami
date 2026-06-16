import { createElement } from 'react';
import { cn } from '@/lib/utils';
import type { ITrackThumbnailProps, ITrackThumbnailView } from './TrackThumbnail.types';

/**
 * Builds the image-or-fallback node for {@link TrackThumbnail}. No React state —
 * the thumbnail is purely presentational — but the convention keeps logic
 * (the `albumArt ?` branch + class merge) out of the shell.
 */
export function useTrackThumbnail({
  albumArt,
  alt,
  fallback,
  fill = false,
  imgClassName,
  className,
}: ITrackThumbnailProps): ITrackThumbnailView {
  const inner = albumArt
    ? createElement('img', {
        src: albumArt,
        alt,
        loading: 'lazy',
        decoding: 'async',
        className: cn('w-full h-full object-cover', imgClassName),
      })
    : fallback;

  return { inner, fill, className };
}
