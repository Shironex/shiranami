import { useId } from 'react';
import type { IHotaruRigProps, IHotaruRigView } from './HotaruRig.types';

/**
 * Hotaru maps the shared cadence onto its own body: where Shio's tail bobs,
 * Hotaru's tendrils trail and its glow-motes ride the same counter-phase
 * pulse. Layer *visibility* is CSS (`data-stage` on the sprite root); this
 * hook only resolves the motion classes and the hatchling eye size.
 */
export function useHotaruRig({ stage, mode, motion }: IHotaruRigProps): IHotaruRigView {
  const maskId = useId();
  const listening = mode === 'listening';
  const grooving = mode === 'grooving';

  let beatClass: string | undefined;
  if (motion && listening) beatClass = 'companion-beat-bob';
  if (motion && grooving) beatClass = 'companion-beat-bob-fast';

  return {
    maskId,
    beatClass,
    bubClass: motion && (listening || grooving) ? 'companion-bub-drift' : undefined,
    blinkClass: motion && mode === 'idle' ? 'companion-idle-blink' : undefined,
    eyeRy: stage === 0 ? 4.2 : 3.4,
    lanternClass: motion ? 'companion-lantern-glow' : undefined,
  };
}
