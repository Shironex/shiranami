import type { Track } from '@/stores/types';

export interface IArtCollageProps {
  /** Library to pull album-art thumbnails from. The collage is decorative only. */
  readonly library: Track[];
}

export interface IArtCollageView {
  /** Too few tracks have artwork — render nothing rather than a sparse strip. */
  readonly isHidden: boolean;
  /** Up to 12 tracks that carry album art, in library order. Owned array. */
  readonly artTracks: Track[];
}
