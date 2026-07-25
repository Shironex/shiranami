import type { IDownloadsSectionSkeletonView } from './DownloadsSectionSkeleton.types';

/**
 * The downloads placeholder has no inputs and no derived state; the hook exists
 * so the shell keeps the same shape as every other component in the feature.
 */
export function useDownloadsSectionSkeleton(): IDownloadsSectionSkeletonView {
  return {};
}
