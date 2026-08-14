import { ImageOff, Music, ArrowRight } from 'lucide-react';
import { EnrichConfidenceBadge } from '@/components/settings/EnrichConfidenceBadge';
import { PreviewFrame } from '@/components/settings/PreviewFrame';
import { cn } from '@/lib/utils';
import { useEnrichBeforeAfterPreview } from './EnrichBeforeAfterPreview.hooks';
import type { EnrichTagCardVariant } from './EnrichBeforeAfterPreview.types';

interface ITrackTagCardProps {
  readonly variant: EnrichTagCardVariant;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
}

function TrackTagCard({ variant, title, artist, album }: ITrackTagCardProps) {
  const isBefore = variant === 'before';
  const detailClassName = cn(
    'truncate text-[11px]',
    isBefore ? 'italic text-muted-foreground/60' : 'text-muted-foreground'
  );
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/25 bg-surface/60 px-2.5 py-2">
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
        <p className={detailClassName}>{artist}</p>
        <p className={detailClassName}>{album}</p>
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
export default function EnrichBeforeAfterPreview() {
  const { t, sampleConfidence } = useEnrichBeforeAfterPreview();

  return (
    <PreviewFrame size="none">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            {t('enr.beforeLabel')}
          </p>
          <TrackTagCard
            variant="before"
            title={t('enr.sampleTitle')}
            artist={t('enr.sampleUnknownArtist')}
            album={t('enr.sampleUnknownAlbum')}
          />
        </div>

        <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
              {t('enr.afterLabel')}
            </p>
            <EnrichConfidenceBadge confidence={sampleConfidence} />
          </div>
          <TrackTagCard
            variant="after"
            title={t('enr.sampleTitle')}
            artist={t('enr.sampleArtist')}
            album={t('enr.sampleAlbum')}
          />
        </div>
      </div>
    </PreviewFrame>
  );
}
