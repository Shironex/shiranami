import { HistoryTrackArtwork } from '@/components/history/HistoryTrackArtwork';
import { useHistoryTopTrackRow } from './HistoryTopTrackRow.hooks';
import type { IHistoryTopTrackRowProps } from './HistoryTopTrackRow.types';

export default function HistoryTopTrackRow(props: IHistoryTopTrackRowProps) {
  const { track, playsLabel, listenTime, onPlay } = useHistoryTopTrackRow(props);

  return (
    <button
      type="button"
      onClick={onPlay}
      className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3 text-left transition-colors hover:border-border/35 hover:bg-accent/35"
    >
      <HistoryTrackArtwork albumArt={track.albumArt} title={track.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{playsLabel}</p>
        <p className="text-[11px] text-muted-foreground/65">{listenTime}</p>
      </div>
    </button>
  );
}
