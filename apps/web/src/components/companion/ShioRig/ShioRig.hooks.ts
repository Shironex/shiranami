import { useId } from 'react';
import type { IShioRigProps, IShioRigView } from './ShioRig.types';

/**
 * Every moving part is a compositor-only utility class; the shell stays a
 * static path list. Layer *visibility* is CSS (`data-stage` on the sprite
 * root), so this hook only resolves the motion classes and the one numeric
 * stage difference (hatchling eye size).
 */
export function useShioRig({ stage, mode, motion }: IShioRigProps): IShioRigView {
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
    eyeRy: stage === 0 ? 3.8 : 3,
  };
}
