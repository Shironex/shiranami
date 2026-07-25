import type { ISplashLampProps, ISplashLampView } from './SplashLamp.types';

/**
 * 9s ease-in-out so the glow reads as a steady lamp modulated by rain on the
 * bulb, not a pulse.
 */
const BREATHE_LOOP = 'shiranami-lamp-breathe 9s ease-in-out infinite';

/**
 * The lamp is one static gradient, so the only prop-derived value is whether
 * the breathe loop runs. The hook resolves the `disabled` default and hands the
 * shell a ready inline animation.
 */
export function useSplashLamp({ disabled = false }: ISplashLampProps): ISplashLampView {
  return { animation: disabled ? undefined : BREATHE_LOOP };
}
