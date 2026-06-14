import { useArtCollage } from './ArtCollage.hooks';
import type { IArtCollageProps } from './ArtCollage.types';

/** A quiet decorative collage of album art from the library. */
export default function ArtCollage({ library }: IArtCollageProps) {
  const view = useArtCollage({ library });

  if (view.isHidden) return null;

  const thumbnails = view.artTracks.map((track, i) => (
    <div key={i} className="w-14 h-14 shrink-0 rounded-md overflow-hidden bg-accent/20">
      <img
        src={track.albumArt!}
        alt=""
        aria-hidden="true"
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </div>
  ));

  return <div className="flex gap-1.5 overflow-hidden rounded-xl opacity-40">{thumbnails}</div>;
}
