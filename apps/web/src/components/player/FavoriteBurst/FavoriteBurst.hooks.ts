import type { IFavoriteBurstProps, IFavoriteBurstView } from './FavoriteBurst.types';

/**
 * FavoriteBurst is a decorative one-shot flourish with no state of its own —
 * the celebration it visualizes is owned by {@link useFavoriteCelebration}
 * upstream. The hook forwards the burst counter that doubles as the ring's
 * remount key so the shell stays a logic-free render.
 */
export function useFavoriteBurst({ burstKey }: IFavoriteBurstProps): IFavoriteBurstView {
  return { burstKey };
}
