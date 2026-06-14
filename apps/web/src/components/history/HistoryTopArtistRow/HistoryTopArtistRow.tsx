import { useHistoryTopArtistRow } from './HistoryTopArtistRow.hooks';
import type { IHistoryTopArtistRowProps } from './HistoryTopArtistRow.types';

export default function HistoryTopArtistRow(props: IHistoryTopArtistRowProps) {
  const { artistName, listenTime, playsLabel } = useHistoryTopArtistRow(props);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{artistName}</p>
        <p className="text-[11px] text-muted-foreground/65">{listenTime}</p>
      </div>
      <span className="shrink-0 text-xs font-medium text-foreground">{playsLabel}</span>
    </div>
  );
}
