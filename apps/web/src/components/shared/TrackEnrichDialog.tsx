import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Disc3,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCw,
  ArrowRight,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore, type EnrichUpdatedFields } from '@/stores/useMetadataEnrichStore';
import { EnrichConfidenceBadge } from '@/components/settings/EnrichConfidenceBadge';

interface TrackEnrichDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: string;
}

type DialogState =
  | { kind: 'searching' }
  | {
      kind: 'found';
      updatedFields: EnrichUpdatedFields;
      source: string;
      confidence?: number;
      coverArt?: string;
    }
  | { kind: 'no-match' }
  | { kind: 'applied' }
  | { kind: 'error'; message: string };

const FIELD_ORDER: Array<keyof EnrichUpdatedFields> = [
  'artist',
  'album',
  'genre',
  'year',
  'trackNumber',
  'albumArt',
];

function formatValue(value: unknown, emptyLabel: string): string {
  // Em/en dashes are banned in user-facing copy across Shiro Suite — fall back
  // to a plain placeholder for "no current value" rendering.
  if (value === null || value === undefined || value === '') return emptyLabel;
  return String(value);
}

export function TrackEnrichDialog({ open, onOpenChange, trackId }: TrackEnrichDialogProps) {
  const { t } = useTranslation('enrichDialog');
  const track = useLibraryStore(s => s.library.find(t => t.id === trackId));
  const previewSingleTrack = useMetadataEnrichStore(s => s.previewSingleTrack);
  const applySingleTrack = useMetadataEnrichStore(s => s.applySingleTrack);
  const cancelSingleTrack = useMetadataEnrichStore(s => s.cancelSingleTrack);

  const [state, setState] = useState<DialogState>({ kind: 'searching' });
  // Default OFF — file writes are irreversible. The dialog itself is the
  // confirmation surface, so we don't double-confirm via an alertdialog.
  const [writeToFile, setWriteToFile] = useState(false);
  const [applying, setApplying] = useState(false);

  const runPreview = useCallback(async () => {
    if (!trackId) return;
    setState({ kind: 'searching' });
    try {
      const result = await previewSingleTrack(trackId);
      if (result.error === 'cancelled') {
        // The dialog was closed mid-flight; nothing to render.
        return;
      }
      if (!result.success || result.source === 'none') {
        setState({ kind: 'no-match' });
        return;
      }
      setState({
        kind: 'found',
        updatedFields: result.updatedFields,
        source: result.source,
        confidence: result.confidence,
        coverArt: result.updatedFields.albumArt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Surface the busy-rejection as a friendly explanation instead of a
      // raw error message — the UI also gates the menu entry, but a
      // race is still possible (open dialog, then start bulk).
      const isBusy =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code: unknown }).code === 'metadata.enrich_busy'
          : message.includes('enrich_busy');
      setState({ kind: 'error', message: isBusy ? t('errorBusy') : t('errorGeneric') });
    }
  }, [previewSingleTrack, trackId, t]);

  // Kick off the lookup when the dialog opens; reset all transient state on close.
  useEffect(() => {
    if (!open) return;
    setWriteToFile(false);
    setApplying(false);
    void runPreview();
    return () => {
      // Best-effort cancel if the dialog closes mid-search.
      void cancelSingleTrack();
    };
  }, [open, runPreview, cancelSingleTrack]);

  const handleApply = useCallback(async () => {
    if (state.kind !== 'found') return;
    setApplying(true);
    try {
      await applySingleTrack(trackId, state.updatedFields, { writeToFile });
      setState({ kind: 'applied' });
      toast.success(t('appliedToast'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState({ kind: 'error', message });
      toast.error(t('applyFailedToast'));
    } finally {
      setApplying(false);
    }
  }, [applySingleTrack, state, trackId, writeToFile, t]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const fieldRows = useMemo(() => {
    if (state.kind !== 'found') return [];
    return FIELD_ORDER.filter(key => state.updatedFields[key] !== undefined).map(key => {
      const proposed = state.updatedFields[key];
      const current =
        key === 'albumArt' ? track?.albumArt : (track?.[key as keyof typeof track] as unknown);
      return { key, current, proposed };
    });
  }, [state, track]);

  if (!track) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Disc3 className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
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
              {track.albumArt ? (
                <img
                  src={track.albumArt}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                  <Disc3 className="w-4 h-4 text-muted-foreground/60" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{track.title}</p>
                <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {t('foundSubtitle', { source: state.source, count: fieldRows.length })}
              </p>
              <EnrichConfidenceBadge confidence={state.confidence} />
            </div>

            <div className="rounded-xl border border-border/30 divide-y divide-border/30 overflow-hidden">
              {fieldRows.map(({ key, current, proposed }) => (
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
                            className="w-8 h-8 rounded-md object-cover opacity-60"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center">
                            <span className="text-muted-foreground/40 text-[10px]">
                              {t('none')}
                            </span>
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
                            className="w-8 h-8 rounded-md object-cover"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <p className="text-muted-foreground line-through truncate">
                          {formatValue(current, t('none'))}
                        </p>
                        <p className="text-foreground truncate">
                          {formatValue(proposed, t('none'))}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
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
          {(state.kind === 'no-match' || state.kind === 'error') && (
            <>
              <Button variant="ghost" onClick={handleClose} className="rounded-lg">
                {t('close')}
              </Button>
              <Button onClick={runPreview} className="rounded-lg gap-2 [&_svg]:size-3.5">
                <RotateCw aria-hidden="true" />
                {t('retry')}
              </Button>
            </>
          )}
          {state.kind === 'applied' && (
            <Button onClick={handleClose} className="rounded-lg gap-2 [&_svg]:size-3.5">
              <Check aria-hidden="true" />
              {t('done')}
            </Button>
          )}
          {state.kind === 'found' && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={applying}
                className="rounded-lg"
              >
                {t('discard')}
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying}
                aria-busy={applying}
                className="rounded-lg gap-2 [&_svg]:size-3.5"
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
      </DialogContent>
    </Dialog>
  );
}
