import { cn } from '@/lib/utils';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { useVinylRecord } from './VinylRecord.hooks';
import type { IVinylRecordProps } from './VinylRecord.types';

/**
 * A spinning vinyl record — the alternative artwork display for the Now
 * Playing view and the Sanctuary's vinyl variant.
 *
 * The disc is pure CSS (grooves via repeating-radial-gradient, 33⅓ RPM spin,
 * 1px-off-center wobble); play/pause eases the animation's playback rate so
 * the groove angle never resets. The static conic sheen sits above the disc
 * and does not rotate. The center label shows the album artwork or the 白波
 * brand mark, and an optional audio-reactive ring (glow / spectrum) is drawn
 * on one absolutely-positioned canvas. All motion collapses under
 * reduced-motion / low-performance mode: frozen disc, no wobble, static halo.
 */
export default function VinylRecord(props: IVinylRecordProps) {
  const {
    discRef,
    ringCanvasRef,
    ringVisible,
    staticRingVisible,
    labelSource,
    albumArt,
    albumAlt,
    className,
  } = useVinylRecord(props);

  const brandMark = (
    <span
      className="select-none text-[34cqw] leading-none text-primary-foreground"
      style={{
        fontFamily: "'Shippori Mincho', 'Noto Sans JP', 'Hiragino Sans', serif",
        fontWeight: 800,
      }}
      aria-hidden="true"
    >
      白波
    </span>
  );

  const labelContent =
    labelSource === 'artwork' ? (
      <TrackThumbnail albumArt={albumArt} alt={albumAlt} fill fallback={brandMark} />
    ) : (
      brandMark
    );

  return (
    <div data-slot="vinyl-record" className={cn('relative aspect-square', className)}>
      {ringVisible && (
        /* Explicit size: a canvas is a replaced element, so inset-only
           positioning would leave it at its intrinsic 300×150 instead of
           stretching it over the disc. */
        <canvas
          ref={ringCanvasRef}
          className="pointer-events-none absolute -left-[15%] -top-[15%] h-[130%] w-[130%]"
          aria-hidden="true"
        />
      )}
      {staticRingVisible && (
        <div className="vinyl-static-ring absolute inset-0 rounded-full" aria-hidden="true" />
      )}

      <div ref={discRef} className="vinyl-disc vinyl-spin absolute inset-0 rounded-full">
        <div className="vinyl-label @container absolute inset-[31%] flex items-center justify-center overflow-hidden rounded-full">
          {labelContent}
        </div>
      </div>

      <div
        className="vinyl-sheen pointer-events-none absolute inset-0 rounded-full"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-[3%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80"
        aria-hidden="true"
      />
    </div>
  );
}
