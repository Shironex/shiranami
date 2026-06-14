import { Music } from 'lucide-react';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { useHistoryTrackArtwork } from './HistoryTrackArtwork.hooks';
import type { IHistoryTrackArtworkProps } from './HistoryTrackArtwork.types';

export default function HistoryTrackArtwork(props: IHistoryTrackArtworkProps) {
  const { albumArt, title } = useHistoryTrackArtwork(props);

  return (
    <TrackThumbnail
      albumArt={albumArt}
      alt={title}
      className="size-11 rounded-xl bg-muted/35"
      fallback={<Music className="size-4 text-muted-foreground/45" />}
    />
  );
}
