import { LibraryBig } from 'lucide-react';
import { useTopAlbums } from './TopAlbums.hooks';
import type { ITopAlbumsProps } from './TopAlbums.types';

/** "Top albums this week" card — horizontal play-count bars per album. */
export default function TopAlbums(props: ITopAlbumsProps) {
  const { title, hasAlbums, emptyCopy, rows } = useTopAlbums(props);

  // Build the list above the return so JSX stays declarative.
  const rowNodes = rows.map(row => (
    <li key={row.key} className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{row.album}</p>
        <p className="truncate text-[11px] text-muted-foreground/65">{row.artist}</p>
      </div>
      <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-foreground/8">
        <span
          className="block h-full rounded-full bg-primary/70"
          style={{ width: `${row.width}%` }}
        />
      </span>
      <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground/70">
        {row.playsLabel}
      </span>
    </li>
  ));

  return (
    <section className="rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center gap-2">
        <LibraryBig className="size-4 text-primary/80" />
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      </div>

      {!hasAlbums ? (
        <p className="mt-4 rounded-2xl border border-border/20 bg-background/20 px-4 py-6 text-center text-sm text-muted-foreground/60">
          {emptyCopy}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">{rowNodes}</ul>
      )}
    </section>
  );
}
