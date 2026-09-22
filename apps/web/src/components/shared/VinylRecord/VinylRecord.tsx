import { cn } from '@/lib/utils';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { useVinylRecord } from './VinylRecord.hooks';
import type { IVinylRecordProps } from './VinylRecord.types';

/**
 * A spinning vinyl record — the alternative artwork display for the Now
 * Playing view and the Sanctuary's vinyl variant.
 *
 * The disc is pure CSS (grooves via repeating-radial-gradient, a spin at the
 * configured turntable speed — 33⅓/45/78 RPM via `--vinyl-rev` — and a
 * 1px-off-center wobble); play/pause eases the animation's playback rate so
 * the groove angle never resets. The pressing's finish (black / clear /
 * marble / picture disc) styles the rotating face; a picture disc spreads the
 * album art across it and drops the paper label. The static conic sheen sits
 * above the disc and does not rotate. The center label shows the album
 * artwork or the 白波 brand mark, and an optional audio-reactive ring
 * (glow / spectrum) is drawn on one absolutely-positioned canvas. An optional
 * tonearm overlay rests on the groove while playing and lifts when paused.
 * All decorative motion collapses under reduced-motion / low-performance
 * mode: frozen disc, no wobble, static halo (the tonearm's angle stays — it
 * conveys play state).
 */
export default function VinylRecord(props: IVinylRecordProps) {
  const {
    discRef,
    ringCanvasRef,
    ringVisible,
    staticRingVisible,
    labelSource,
    finish,
    spinStyle,
    pictureArt,
    tonearmVisible,
    tonearmResting,
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

      <div
        ref={discRef}
        data-finish={finish}
        style={spinStyle}
        className="vinyl-disc vinyl-spin absolute inset-0 rounded-full"
      >
        {pictureArt ? (
          /* Picture disc: the artwork is the face — no paper label; the groove
             film keeps it reading as a pressing rather than a sticker. */
          <>
            <img
              src={pictureArt}
              alt={albumAlt}
              decoding="async"
              className="absolute inset-0 size-full rounded-full object-cover"
            />
            <div
              className="vinyl-picture-grooves absolute inset-0 rounded-full"
              aria-hidden="true"
            />
          </>
        ) : (
          <div className="vinyl-label @container absolute inset-[31%] flex items-center justify-center overflow-hidden rounded-full">
            {labelContent}
          </div>
        )}
      </div>

      <div
        className="vinyl-sheen pointer-events-none absolute inset-0 rounded-full"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 size-[3%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80"
        aria-hidden="true"
      />

      {tonearmVisible && (
        <div
          data-slot="vinyl-tonearm"
          data-resting={tonearmResting}
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="vinyl-tonearm-base absolute right-[1.5%] top-[1.5%] size-[10%] rounded-full" />
          <div className="vinyl-tonearm-arm absolute right-[5%] top-[6.5%] h-[46%] w-[3%] origin-top">
            <div className="vinyl-tonearm-weight absolute -top-[10%] left-1/2 h-[11%] w-[170%] -translate-x-1/2 rounded-[30%]" />
            <div className="vinyl-tonearm-shaft absolute inset-x-[30%] top-0 h-full rounded-full" />
            <div className="vinyl-tonearm-head absolute -left-[55%] bottom-0 h-[13%] w-[210%] rounded-[20%]" />
          </div>
        </div>
      )}
    </div>
  );
}
