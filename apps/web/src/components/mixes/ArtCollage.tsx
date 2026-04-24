import { useMemo } from 'react';
import { Music } from 'lucide-react';
import type { Track } from '@/stores/types';

/** A quiet decorative collage of album art from the library. */
export function ArtCollage({ library }: { library: Track[] }) {
  const artTracks = useMemo(
    () => library.filter((t) => t.albumArt).slice(0, 12),
    [library]
  );

  if (artTracks.length < 4) return null;

  return (
    <div className="flex gap-1.5 overflow-hidden rounded-xl opacity-40">
      {artTracks.map((track, i) => (
        <div
          key={i}
          className="w-14 h-14 shrink-0 rounded-md overflow-hidden bg-accent/20"
        >
          {track.albumArt ? (
            <img src={track.albumArt} alt="" aria-hidden="true" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4 text-muted-foreground/20" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
