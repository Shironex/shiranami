import { cn } from '@/lib/utils';
import { useHotaruRig } from './HotaruRig.hooks';
import type { IHotaruRigProps } from './HotaruRig.types';

/**
 * Hotaru (蛍) — the star jelly. A moon jelly (海月, "sea moon") that fills
 * with accent-lit glow-motes as it grows — one more per stage, a tiny night
 * sky inside the bell — until the crescent perches on top at stage V.
 * Tendrils trail the tempo; the outer accent pair arrives with stages III–IV.
 * Renders as a fragment inside the Companion sprite's rig group; stage layers
 * carry `companion-s*` classes revealed by the root's `data-stage`.
 */
export default function HotaruRig({ stage, mode, motion }: IHotaruRigProps) {
  const { maskId, beatClass, bubClass, blinkClass, eyeRy } = useHotaruRig({ stage, mode, motion });

  return (
    <g data-slot="hotaru-rig" transform="translate(0,-3)">
      {/* Tendrils — two at hatch, five by stage IV; the outer pair wears the accent. */}
      <g className={beatClass}>
        <path className="companion-tendril" d="M 53 64 Q 51 74 54 82" />
        <path className="companion-tendril" d="M 67 64 Q 69 74 66 82" />
        <path className="companion-tendril companion-s2" d="M 60 65 Q 59 76 61 88" />
        <path
          className="companion-tendril companion-tendril-accent companion-s3"
          d="M 45 61 Q 41 71 45 79 Q 48 85 44 91"
        />
        <path
          className="companion-tendril companion-tendril-accent companion-s4"
          d="M 75 61 Q 79 71 75 79 Q 72 85 76 91"
        />
      </g>

      {/* The bell. */}
      <path
        className="companion-foam"
        d="M 34 58 Q 34 28 60 27 Q 86 28 86 58 Q 80 63 73 60.5 Q 68 64.5 60 64.5 Q 52 64.5 47 60.5 Q 40 63 34 58 Z"
      />
      <ellipse className="companion-tint" cx="60" cy="47" rx="17" ry="12" />

      {/* Glow-motes — one more per stage; the light does the talking. */}
      <g className={beatClass} opacity={0.85}>
        <circle className="companion-glow" cx="58" cy="40" r="2" />
        <circle className="companion-glow companion-s2" cx="50" cy="46" r="2" />
        <circle className="companion-glow companion-s3" cx="68" cy="43" r="2" />
        <circle className="companion-glow companion-s4" cx="61" cy="51" r="2" />
        <circle className="companion-glow companion-s5" cx="46" cy="39" r="2" />
      </g>

      {/* Tiny headphones — the family-resemblance moment with Nami (stage IV). */}
      <g className="companion-s4">
        <path
          className="companion-ink-s"
          d="M 40 45 Q 60 29 80 45"
          style={{ strokeWidth: 3, opacity: 0.85 }}
        />
        <circle className="companion-gear" cx="40" cy="47.5" r="4.2" />
        <circle className="companion-gear" cx="80" cy="47.5" r="4.2" />
      </g>

      {/* The crescent finally perches on the bell at stage V. */}
      <g className="companion-s5" transform="rotate(-14 60 16)">
        <mask id={maskId}>
          <rect width="120" height="112" fill="white" />
          <circle cx="65" cy="13.5" r="6" fill="black" />
        </mask>
        <circle className="companion-crescent" cx="60" cy="16" r="7" mask={`url(#${maskId})`} />
      </g>

      {/* Face — variants swap via the root's data-face; fixed dark ink. */}
      <g className="companion-face">
        <g className={cn('companion-f-open', blinkClass)}>
          <ellipse className="companion-ink" cx="51" cy="50" rx="2.4" ry={eyeRy} />
          <ellipse className="companion-ink" cx="69" cy="50" rx="2.4" ry={eyeRy} />
        </g>
        <g className="companion-f-half">
          <ellipse className="companion-ink" cx="51" cy="51.3" rx="2.4" ry="1.7" />
          <ellipse className="companion-ink" cx="69" cy="51.3" rx="2.4" ry="1.7" />
        </g>
        <g className="companion-f-closed">
          <path className="companion-ink-s" d="M 47.8 51 Q 51 53.8 54.2 51" />
          <path className="companion-ink-s" d="M 65.8 51 Q 69 53.8 72.2 51" />
        </g>
        <g className="companion-s3">
          <ellipse className="companion-blush" cx="46" cy="56" rx="3" ry="1.7" />
          <ellipse className="companion-blush" cx="74" cy="56" rx="3" ry="1.7" />
        </g>
      </g>

      {/* Ambient foam bubbles from stage IV. */}
      <g className={bubClass}>
        <circle className="companion-bub companion-s4" cx="28" cy="40" r="1.5" opacity={0.7} />
        <circle className="companion-bub companion-s4" cx="93" cy="34" r="1.6" opacity={0.7} />
      </g>
    </g>
  );
}
