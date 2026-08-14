import type {
  IDownloadsViewSkeletonSection,
  IDownloadsViewSkeletonView,
} from './DownloadsViewSkeleton.types';

/**
 * Two lifecycle groups' worth of placeholder rows, echoing the Active / Queued
 * sections a restored queue typically renders into.
 */
const SECTION_ROW_COUNTS: readonly number[] = [2, 3];

// The frame is fixed, so the keys are built once at module scope rather than
// on every render.
const SECTIONS: readonly IDownloadsViewSkeletonSection[] = SECTION_ROW_COUNTS.map(
  (rowCount, sectionIndex) => ({
    key: `downloads-skeleton-section-${sectionIndex}`,
    rowKeys: Array.from(
      { length: rowCount },
      (_, rowIndex) => `downloads-skeleton-row-${sectionIndex}-${rowIndex}`
    ),
  })
);

/**
 * Owns the placeholder section list so the shell only maps ready-made keys into
 * markup and stays a thin, logic-free render.
 */
export function useDownloadsViewSkeleton(): IDownloadsViewSkeletonView {
  return { sections: SECTIONS };
}
