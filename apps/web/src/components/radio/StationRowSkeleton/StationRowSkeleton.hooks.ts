import type { IStationRowSkeletonView } from './StationRowSkeleton.types';

/**
 * The placeholder row has no inputs and no derived state; the hook exists so
 * the shell keeps the same shape as every other component in the feature.
 */
export function useStationRowSkeleton(): IStationRowSkeletonView {
  return {};
}
