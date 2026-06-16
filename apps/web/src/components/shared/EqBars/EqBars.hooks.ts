import type { IEqBarsProps, IEqBarsView } from './EqBars.types';

/**
 * Resolves the {@link EqBars} size variant. Presentational-only, but the
 * convention keeps the `size === 'sm'` derivation out of the shell body.
 */
export function useEqBars({ size = 'default' }: IEqBarsProps): IEqBarsView {
  return { sm: size === 'sm' };
}
