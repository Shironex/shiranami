import { useTranslation } from 'react-i18next';
import { ImageOff, Music, ArrowRight } from 'lucide-react';
import { EnrichConfidenceBadge } from '@/components/settings/EnrichConfidenceBadge';

// Illustrative confidence for the enriched sample — a "strong match" so the
// badge demonstrates the high tier the user will most often see.
const SAMPLE_CONFIDENCE = 0.92;

interface TrackTagCardProps {
  variant: 'before' | 'after';
  title: string;
  artist: string;
  album: string;
}

function TrackTagCard({ variant, title, artist, album }: TrackTagCardProps) {
  const isBefore = variant === 'before';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-background/40 px-2.5 py-2">
      {isBefore ? (
        <div className="grid size-10 shrink-0 place-items-center rounded-md border border-dashed border-border/50 bg-background/60 text-muted-foreground/50">
          <ImageOff className="size-4" />
        </div>
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
          <Music className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
        <p
          className={
            isBefore
              ? 'truncate text-[11px] italic text-muted-foreground/60'
              : 'truncate text-[11px] text-muted-foreground'
          }
        >
          {artist}
        </p>
        <p
          className={
            isBefore
              ? 'truncate text-[11px] italic text-muted-foreground/60'
              : 'truncate text-[11px] text-muted-foreground'
          }
        >
          {album}
        </p>
      </div>
    </div>
  );
}

/**
 * Static before/after sample of what enrichment does to a track: raw
 * filename-derived tags (no art, "Unknown" fields) → filled cover art, artist,
 * and album with a confidence pill. Makes the feature's value legible *before*
 * the user commits — especially important for the irreversible file-write path.
 */
export function EnrichBeforeAfterPreview() {
  const { t } = useTranslation('settings');

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
          {t('enrich.beforeLabel')}
        </p>
        <TrackTagCard
          variant="before"
          title={t('enrich.sampleTitle')}
          artist={t('enrich.sampleUnknownArtist')}
          album={t('enrich.sampleUnknownAlbum')}
        />
      </div>

      <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            {t('enrich.afterLabel')}
          </p>
          <EnrichConfidenceBadge confidence={SAMPLE_CONFIDENCE} />
        </div>
        <TrackTagCard
          variant="after"
          title={t('enrich.sampleTitle')}
          artist={t('enrich.sampleArtist')}
          album={t('enrich.sampleAlbum')}
        />
      </div>
    </div>
  );
}
