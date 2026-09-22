import {
  Disc3,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCw,
  ArrowRight,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogHint,
  DialogHintBar,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EnrichConfidenceBadge } from '@/components/settings/EnrichConfidenceBadge';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { useTrackEnrichDialog } from './TrackEnrichDialog.hooks';
import type { ITrackEnrichDialogProps } from './TrackEnrichDialog.types';

function formatValue(value: unknown, emptyLabel: string): string {
  // Em/en dashes are banned in user-facing copy across Shiro Suite — fall back
  // to a plain placeholder for "no current value" rendering.
  if (value === null || value === undefined || value === '') return emptyLabel;
  return String(value);
}

export default function TrackEnrichDialog(props: ITrackEnrichDialogProps) {
  const { open, onOpenChange } = props;
  const {
    t,
    hasTrack,
    trackTitle,
    trackArtist,
    trackAlbumArt,
    state,
    fieldRows,
    writeToFile,
    setWriteToFile,
    applying,
    runPreview,
    handleApply,
    handleClose,
  } = useTrackEnrichDialog(props);

  if (!hasTrack) return null;

  const showRetryFooter = state.kind === 'no-match' || state.kind === 'error';

  const diffRows = fieldRows.map(({ key, current, proposed }) => (
    <div key={key} className="flex items-start gap-3 px-3 py-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground/70 font-medium pt-0.5">
        {t(`field.${key}`)}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        {key === 'albumArt' ? (
          <div className="flex items-center gap-2">
            {current ? (
              <img
                src={current as string}
                alt=""
                aria-hidden="true"
                className="w-8 h-8 rounded-md object-cover opacity-60"
              />
            ) : (
              <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center">
                <span className="text-muted-foreground/40 text-[10px]">{t('none')}</span>
              </div>
            )}
            <ArrowRight
              className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"
              aria-hidden="true"
            />
            {proposed ? (
              <img
                src={proposed as string}
                alt=""
                aria-hidden="true"
                className="w-8 h-8 rounded-md object-cover"
              />
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-muted-foreground line-through truncate">
              {formatValue(current, t('none'))}
            </p>
            <p className="text-foreground truncate">{formatValue(proposed, t('none'))}</p>
          </>
        )}
      </div>
    </div>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Disc3 className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {state.kind === 'searching' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 min-h-[180px]">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t('searching')}</p>
          </div>
        )}

        {state.kind === 'no-match' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center min-h-[180px] justify-center">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t('noMatchTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('noMatchBody')}</p>
            </div>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center min-h-[180px] justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        )}

        {state.kind === 'applied' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center min-h-[180px] justify-center">
            <CheckCircle2 className="w-6 h-6 text-primary" />
            <p className="text-sm font-medium text-foreground">{t('appliedTitle')}</p>
          </div>
        )}

        {state.kind === 'found' && (
          <div className="space-y-3">
            {/* Track header lives inside the found state — it earns its space here. */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
              <TrackThumbnail
                albumArt={trackAlbumArt}
                alt=""
                className="w-10 h-10 rounded-md bg-muted"
                imgClassName="rounded-md"
                fallback={<Disc3 className="w-4 h-4 text-muted-foreground/60" />}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{trackTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{trackArtist}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {t('foundSubtitle', { source: state.source, count: fieldRows.length })}
              </p>
              <EnrichConfidenceBadge confidence={state.confidence} />
            </div>

            <div className="rounded-xl border border-border/30 divide-y divide-border/30 overflow-hidden">
              {diffRows}
            </div>

            <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20 cursor-pointer">
              <Switch
                checked={writeToFile}
                onCheckedChange={setWriteToFile}
                disabled={applying}
                aria-label={t('writeToFileLabel')}
                className="shrink-0"
              />
              <span className="space-y-0.5 min-w-0">
                <span className="block text-sm text-foreground">{t('writeToFileLabel')}</span>
                <span className="block text-xs text-muted-foreground">{t('writeToFileDesc')}</span>
              </span>
            </label>
          </div>
        )}

        {/* Footer actions vary by state. */}
        <div className="flex justify-end gap-2">
          {showRetryFooter && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                {t('close')}
              </Button>
              <Button onClick={runPreview} className="gap-2 [&_svg]:size-3.5">
                <RotateCw aria-hidden="true" />
                {t('retry')}
              </Button>
            </>
          )}
          {state.kind === 'applied' && (
            <Button onClick={handleClose} className="gap-2 [&_svg]:size-3.5">
              <Check aria-hidden="true" />
              {t('done')}
            </Button>
          )}
          {state.kind === 'found' && (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={applying}>
                {t('discard')}
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying}
                aria-busy={applying}
                className="gap-2 [&_svg]:size-3.5"
              >
                {applying ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {applying ? t('applying') : t('apply')}
              </Button>
            </>
          )}
        </div>

        <DialogHintBar>
          <DialogHint keyLabel="Esc" label={t('close')} />
        </DialogHintBar>
      </DialogContent>
    </Dialog>
  );
}
