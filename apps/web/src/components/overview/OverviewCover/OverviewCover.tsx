import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { cn } from '@/lib/utils';
import { useOverviewCover } from './OverviewCover.hooks';
import type { IOverviewCoverProps } from './OverviewCover.types';

/**
 * Cover art for Overview rows/cards. Shows the real album art when present,
 * otherwise a deterministic gradient + a representative glyph derived from the
 * seed — the mockup's `.cv`/`.thumb` look, but the gradient reads `--primary`
 * via a hue rotation so it re-tints with the active theme instead of being
 * locked to lavender.
 */
export default function OverviewCover(props: IOverviewCoverProps) {
  const { albumArt, title, className } = props;
  const { rotate, glyph } = useOverviewCover(props);

  return (
    <TrackThumbnail
      albumArt={albumArt}
      alt={title}
      className={cn('rounded-xl', className)}
      fallback={
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/70 to-primary/15"
          style={{ filter: `hue-rotate(${rotate}deg)` }}
        >
          <span className="select-none font-display text-lg text-white/90">{glyph}</span>
        </div>
      }
    />
  );
}
