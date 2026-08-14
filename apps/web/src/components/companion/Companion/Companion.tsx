import { cn } from '@/lib/utils';
import { ShioRig } from '@/components/companion/ShioRig';
import { HotaruRig } from '@/components/companion/HotaruRig';
import { useCompanion } from './Companion.hooks';
import type { ICompanionProps } from './Companion.types';

/**
 * The resident sprite — one shell, two species. Renders the shared stage
 * (ripple pool, ripple ring, level-up foam bubbles) around the chosen rig,
 * stamps the state/stage/face/outfit data attributes the companion CSS keys off,
 * and runs the WAAPI one-shots. Purely presentational: the machine lives in
 * `useCompanionPresence`, interactions live on the surfaces (perch).
 *
 * Accessibility contract: the whole sprite is `aria-hidden` decoration and
 * never reaches the a11y tree; hit-testing is the surface's concern.
 */
export default function Companion(props: ICompanionProps) {
  const { species, stage, mode, outfit, size = 56, className } = props;
  const { svgRef, face, rigClass, hopClass, height, rootStyle } = useCompanion(props);

  return (
    <svg
      ref={svgRef}
      className={cn('companion-svg', className)}
      viewBox="0 0 120 112"
      width={size}
      height={height}
      data-slot="companion"
      data-species={species}
      data-stage={stage}
      data-state={mode}
      data-face={face}
      data-outfit={outfit ?? undefined}
      style={rootStyle}
      aria-hidden="true"
      focusable="false"
    >
      {/* The ripple pool — shadow and stage indicator in one (from stage II). */}
      <ellipse className="companion-pool companion-s2" cx="60" cy="96" rx="25" ry="4.4" />
      <ellipse className="companion-ripple-ring" cx="60" cy="96" rx="25" ry="4.4" />

      <g className={hopClass}>
        <g className={cn('companion-rig', rigClass)}>
          {species === 'shio' ? (
            <ShioRig stage={stage} mode={mode} motion={props.motion} outfit={outfit} />
          ) : (
            <HotaruRig stage={stage} mode={mode} motion={props.motion} outfit={outfit} />
          )}
        </g>
      </g>

      {/* Level-up foam bubbles — invisible until the WAAPI one-shot lifts them. */}
      <g>
        <circle className="companion-lvbub" cx="42" cy="46" r="2.6" />
        <circle className="companion-lvbub" cx="60" cy="40" r="3.2" />
        <circle className="companion-lvbub" cx="78" cy="47" r="2.4" />
        <circle className="companion-lvbub" cx="50" cy="42" r="1.8" />
        <circle className="companion-lvbub" cx="70" cy="41" r="2" />
      </g>
    </svg>
  );
}
