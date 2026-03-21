import { formatDuration } from '@shiranami/shared';
import { Music } from 'lucide-react';
import type {
  ListeningHistoryEntry,
  ListeningStatsArtist,
  ListeningStatsTrack,
} from '@/types/electron';
import { formatListenTime, formatPlayedAt } from './historyUtils';

function TrackArtwork({ albumArt, title }: { albumArt: string | null; title: string }) {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/35">
      {albumArt ? (
        <img src={albumArt} alt={title} className="h-full w-full object-cover" />
      ) : (
        <Music className="size-4 text-muted-foreground/45" />
      )}
    </div>
  );
}

type TopTrackRowProps = {
  track: ListeningStatsTrack;
  onPlay: (trackId: string) => void;
};

export function TopTrackRow({ track, onPlay }: TopTrackRowProps) {
  return (
    <button
      type="button"
      onClick={() => onPlay(track.trackId)}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3 text-left transition-colors hover:border-border/35 hover:bg-accent/35"
    >
      <TrackArtwork albumArt={track.albumArt} title={track.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{track.playCount} plays</p>
        <p className="text-[11px] text-muted-foreground/65">
          {formatListenTime(track.listenedSeconds)}
        </p>
      </div>
    </button>
  );
}

export function TopArtistRow({ artist }: { artist: ListeningStatsArtist }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {artist.artist || 'Unknown Artist'}
        </p>
        <p className="text-[11px] text-muted-foreground/65">
          {formatListenTime(artist.listenedSeconds)}
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium text-foreground">
        {artist.playCount} plays
      </span>
    </div>
  );
}

type RecentRowProps = {
  entry: ListeningHistoryEntry;
  onPlay: (trackId: string) => void;
};

export function RecentRow({ entry, onPlay }: RecentRowProps) {
  return (
    <button
      type="button"
      onClick={() => onPlay(entry.trackId)}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3 text-left transition-colors hover:border-border/35 hover:bg-accent/35"
    >
      <TrackArtwork albumArt={entry.albumArt} title={entry.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.artist} / {entry.album}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">
          {formatDuration(entry.playedSeconds)}
        </p>
        <p className="text-[11px] text-muted-foreground/65">{formatPlayedAt(entry.playedAt)}</p>
      </div>
    </button>
  );
}
