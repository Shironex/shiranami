import { cn } from '@/lib/utils';
import { useShioRig } from './ShioRig.hooks';
import type { IShioRigProps } from './ShioRig.types';

/**
 * Shio (潮) — the tide-cat. A sitting chibi foam cat whose wave lives in its
 * tail: a stub at stage I that curls into a foam-tufted breaking crest by V.
 * Whiskers from II, blush from III, tiny headphones at IV, crescent-moon halo
 * at V. Renders as a fragment inside the Companion sprite's rig group; stage
 * layers carry `companion-s*` classes and are revealed by the root's
 * `data-stage` (see globals.css "Companion sprite").
 */
export default function ShioRig({ stage, mode, motion, outfit }: IShioRigProps) {
  const { maskId, beatClass, bubClass, blinkClass, eyeRy, lanternClass } = useShioRig({
    stage,
    mode,
    motion,
  });

  return (
    <g data-slot="shio-rig">
      {/* Stub tail — the hatchling's whole wave. Replaced by the crest at II. */}
      <path
        className="companion-s1-only"
        d="M 73 85 Q 79 81 77 74"
        style={{ fill: 'none', stroke: 'var(--companion-foam)', strokeWidth: 5 }}
        strokeLinecap="round"
      />

      {/* The wave-tail crest — Shio's growth made visible (scales via CSS). */}
      <g
        className={cn('companion-crest', 'companion-s2', beatClass)}
        style={{ transformOrigin: '76px 80px' }}
      >
        <path
          className="companion-foam"
          d="M 74 84 C 89 82 96 71 92 60 C 89 52 80 53 79 59 C 85 58 88 63 85 69 C 82 75 77 78 71 80 Z"
        />
        <g className="companion-s5">
          <circle className="companion-bub" cx="87" cy="58" r="2.4" />
          <circle className="companion-bub" cx="93" cy="64" r="1.7" />
        </g>
      </g>

      {/* Body, paws, head, ears. */}
      <ellipse className="companion-foam" cx="58" cy="79" rx="19" ry="14.5" />
      <ellipse className="companion-tint" cx="58" cy="79" rx="13" ry="9" />
      <ellipse className="companion-foam" cx="49" cy="92" rx="5" ry="2.6" />
      <ellipse className="companion-foam" cx="67" cy="92" rx="5" ry="2.6" />
      <circle className="companion-foam" cx="58" cy="51" r="19" />
      <path className="companion-foam" d="M 44 41 Q 42 27 52 29 Q 55 34 53 41 Z" />
      <path className="companion-foam" d="M 72 41 Q 74 27 64 29 Q 61 34 63 41 Z" />
      <path className="companion-earfill" d="M 45.5 39.5 Q 44.5 30.5 51 32 Q 53 35.5 51.5 39.5 Z" />
      <path className="companion-earfill" d="M 70.5 39.5 Q 71.5 30.5 65 32 Q 63 35.5 64.5 39.5 Z" />

      {/* Tiny headphones — the family-resemblance moment with Nami (stage IV). */}
      <g className="companion-s4">
        <path
          className="companion-ink-s"
          d="M 42 44 Q 58 33 74 44"
          style={{ strokeWidth: 2.8, opacity: 0.85 }}
        />
        <circle className="companion-gear" cx="42" cy="46.5" r="3.9" />
        <circle className="companion-gear" cx="74" cy="46.5" r="3.9" />
      </g>

      {/* Whiskers from stage II. */}
      <g className="companion-s2" opacity={0.5}>
        <path className="companion-ink-s" d="M 38 52 L 30 50" style={{ strokeWidth: 1 }} />
        <path className="companion-ink-s" d="M 38 56 L 30 57" style={{ strokeWidth: 1 }} />
        <path className="companion-ink-s" d="M 78 52 L 86 50" style={{ strokeWidth: 1 }} />
        <path className="companion-ink-s" d="M 78 56 L 86 57" style={{ strokeWidth: 1 }} />
      </g>

      {/* Face — variants swap via the root's data-face; fixed dark ink. */}
      <g className="companion-face">
        <g className={cn('companion-f-open', blinkClass)}>
          <ellipse className="companion-ink" cx="50" cy="52" rx="2.4" ry={eyeRy} />
          <ellipse className="companion-ink" cx="66" cy="52" rx="2.4" ry={eyeRy} />
        </g>
        <g className="companion-f-half">
          <ellipse className="companion-ink" cx="50" cy="53.3" rx="2.4" ry="1.7" />
          <ellipse className="companion-ink" cx="66" cy="53.3" rx="2.4" ry="1.7" />
        </g>
        <g className="companion-f-closed">
          <path className="companion-ink-s" d="M 46.8 53 Q 50 55.8 53.2 53" />
          <path className="companion-ink-s" d="M 62.8 53 Q 66 55.8 69.2 53" />
        </g>
        <path
          className="companion-ink-s"
          d="M 54.5 59 Q 56.4 61 58 59.2 Q 59.6 61 61.5 59"
          style={{ strokeWidth: 1.3 }}
        />
        <g className="companion-s3">
          <ellipse className="companion-blush" cx="44" cy="58" rx="2.9" ry="1.6" />
          <ellipse className="companion-blush" cx="72" cy="58" rx="2.9" ry="1.6" />
        </g>
      </g>

      {/* Crescent-moon halo — the terminal stage's quiet crown. */}
      <g className="companion-s5" transform="rotate(-12 58 14)">
        <mask id={maskId}>
          <rect width="120" height="112" fill="white" />
          <circle cx="63" cy="11.5" r="7" fill="black" />
        </mask>
        <circle className="companion-crescent" cx="58" cy="14" r="8" mask={`url(#${maskId})`} />
      </g>

      {/* Orbiting foam flecks from stage IV. */}
      <g className="companion-s4">
        <circle className="companion-bub" cx="26" cy="46" r="1.5" opacity={0.7} />
        <circle className="companion-bub" cx="96" cy="40" r="1.6" opacity={0.7} />
      </g>

      {/* Ground foam bubbles — Shio's feet dissolving into the shoreline. */}
      <g className={bubClass}>
        <circle className="companion-bub" cx="72" cy="90.5" r="2" />
        <circle className="companion-bub companion-s2" cx="41" cy="91" r="1.7" />
      </g>

      {/* Weather fit — at most one accessory mounts, so a bare Shio (outfit
          null) renders byte-identical to the outfit-less rig. */}
      {outfit === 'umbrella' && (
        <g className="companion-outfit companion-o-umbrella">
          <path
            className="companion-ink-s"
            d="M 72 44 Q 78 64 74 82"
            style={{ strokeWidth: 1.6, opacity: 0.7 }}
          />
          <path
            className="companion-o-canopy"
            d="M 34 36 Q 58 14 86 34 Q 72 29 58 30 Q 44 31 34 36 Z"
          />
          <path
            className="companion-ink-s"
            d="M 40 33 Q 58 21 81 32"
            style={{ strokeWidth: 1, opacity: 0.45 }}
          />
        </g>
      )}
      {outfit === 'scarf' && (
        <g className="companion-outfit companion-o-scarf">
          <path
            className="companion-o-accent"
            d="M 42 62 Q 58 71 74 62 Q 75 66 74 68 Q 58 77 42 68 Q 41 66 42 62 Z"
          />
          <path className="companion-o-accent" d="M 66 67 L 71 81 Q 66 84 61 80 Z" />
        </g>
      )}
      {outfit === 'sun' && (
        <g className="companion-outfit companion-o-sun">
          <path className="companion-o-drop" d="M 80 34 Q 86 43 80 47 Q 74 43 80 34 Z" />
          <path className="companion-o-drop" d="M 88 44 Q 91 48 88 50 Q 85 48 88 44 Z" />
        </g>
      )}
      {outfit === 'lantern' && (
        <g className={cn('companion-outfit companion-o-lantern', lanternClass)}>
          <circle className="companion-o-halo" cx="29" cy="40" r="7.5" />
          <circle className="companion-o-glowcore" cx="29" cy="40" r="3" />
        </g>
      )}
      {outfit === 'sakura' && (
        <g className="companion-outfit companion-o-sakura">
          <path className="companion-o-petal" d="M 56 27 Q 60 22 64 27 Q 60 33 56 27 Z" />
          <path
            className="companion-o-petal"
            d="M 88 52 Q 91 49 93 52 Q 91 56 88 52 Z"
            opacity={0.7}
          />
        </g>
      )}
      {outfit === 'maple' && (
        <g className="companion-outfit companion-o-maple" transform="rotate(14 61 29)">
          <path
            className="companion-o-accent"
            d="M 61 21 L 64 27 L 70 25 L 66 30 L 70 34 L 63 33 L 61 39 L 59 33 L 52 34 L 56 30 L 52 25 L 58 27 Z"
          />
        </g>
      )}
      {outfit === 'snow' && (
        <g className="companion-outfit companion-o-snow">
          <circle className="companion-o-snowflake" cx="48" cy="31" r="1.7" />
          <circle className="companion-o-snowflake" cx="59" cy="27" r="2" />
          <circle className="companion-o-snowflake" cx="69" cy="32" r="1.5" />
          <circle className="companion-o-snowflake" cx="84" cy="63" r="1.3" />
        </g>
      )}
    </g>
  );
}
