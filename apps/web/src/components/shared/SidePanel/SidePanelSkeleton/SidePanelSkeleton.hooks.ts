import type { ISidePanelSkeletonView } from './SidePanelSkeleton.types';

/**
 * The skeleton takes no props; the hook supplies the placeholder-row keys so
 * the shell stays a logic-free frame. Six rows sketch a plausible track list
 * without implying a specific queue length.
 */
const ROW_COUNT = 6;

const ROW_KEYS: readonly number[] = Array.from({ length: ROW_COUNT }, (_, index) => index);

export function useSidePanelSkeleton(): ISidePanelSkeletonView {
  return {
    rowKeys: ROW_KEYS,
  };
}
