import { cn } from '@/lib/utils';
import { useTrackThumbnail } from './TrackThumbnail.hooks';
import type { ITrackThumbnailProps } from './TrackThumbnail.types';

/**
 * The album-art thumbnail block shared across player/shared track rows: a
 * fixed-square container that shows the cover image (lazy + async-decoded,
 * object-cover) or a caller-provided fallback. Consolidates the repeated
 * `albumArt ? <img …> : <fallback>` markup.
 */
export default function TrackThumbnail(props: ITrackThumbnailProps) {
  const { inner, fill, className } = useTrackThumbnail(props);

  if (fill) return <>{inner}</>;

  return (
    <div className={cn('flex items-center justify-center shrink-0 overflow-hidden', className)}>
      {inner}
    </div>
  );
}
