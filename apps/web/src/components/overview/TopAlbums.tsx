import { useTranslation } from 'react-i18next';
import { LibraryBig } from 'lucide-react';
import type { ListeningAlbumStat } from '@/types/electron';

interface TopAlbumsProps {
  albums: ListeningAlbumStat[];
}

/**
 * "Top albums this week" — the substitute for the mockup's genre "mood" card.
 * Genre data is too sparse to drive a faithful breakdown (research §1.4), so
 * this keeps the card slot + horizontal-bar visual but tallies album play
 * counts, which the app reliably has.
 */
export function TopAlbums({ albums }: TopAlbumsProps) {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');
  const maxPlays = albums.reduce((max, album) => Math.max(max, album.playCount), 0);

  return (
    <section className="rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center gap-2">
        <LibraryBig className="size-4 text-primary/80" />
        <h2 className="font-display text-lg font-semibold text-foreground">
          {t('topAlbums', { em: t('topAlbumsEm') })}
        </h2>
      </div>

      {albums.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border/20 bg-background/20 px-4 py-6 text-center text-sm text-muted-foreground/60">
          {t('albumsEmptyCopy')}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {albums.map(album => {
            const width =
              maxPlays > 0 ? Math.max(6, Math.round((album.playCount / maxPlays) * 100)) : 0;
            return (
              <li key={`${album.album}-${album.artist}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{album.album}</p>
                  <p className="truncate text-[11px] text-muted-foreground/65">
                    {album.artist || tCommon('unknownArtist')}
                  </p>
                </div>
                <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-foreground/8">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground/70">
                  {t('albumPlays', { count: album.playCount })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
