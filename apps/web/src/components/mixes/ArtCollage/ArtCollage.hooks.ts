import { useMemo } from 'react';
import type { IArtCollageProps, IArtCollageView } from './ArtCollage.types';

export function useArtCollage({ library }: IArtCollageProps): IArtCollageView {
  const artTracks = useMemo(() => library.filter(t => t.albumArt).slice(0, 12), [library]);

  return {
    // Below four pieces of artwork the strip looks broken rather than quiet.
    isHidden: artTracks.length < 4,
    artTracks,
  };
}
