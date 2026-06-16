import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore, type EnrichUpdatedFields } from '@/stores/useMetadataEnrichStore';
import type {
  IEnrichFieldRow,
  ITrackEnrichDialogProps,
  ITrackEnrichDialogView,
  TrackEnrichDialogState,
} from './TrackEnrichDialog.types';

const FIELD_ORDER: Array<keyof EnrichUpdatedFields> = [
  'artist',
  'album',
  'genre',
  'year',
  'trackNumber',
  'albumArt',
];

export function useTrackEnrichDialog({
  open,
  onOpenChange,
  trackId,
}: ITrackEnrichDialogProps): ITrackEnrichDialogView {
  const { t } = useTranslation('enrichDialog');
  const track = useLibraryStore(s => s.library.find(tr => tr.id === trackId));
  const previewSingleTrack = useMetadataEnrichStore(s => s.previewSingleTrack);
  const applySingleTrack = useMetadataEnrichStore(s => s.applySingleTrack);
  const cancelSingleTrack = useMetadataEnrichStore(s => s.cancelSingleTrack);

  const [state, setState] = useState<TrackEnrichDialogState>({ kind: 'searching' });
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
      // Surface the busy-rejection as a friendly explanation instead of a
      // raw error message — the UI also gates the menu entry, but a
      // race is still possible (open dialog, then start bulk). The preload
      // invoke wrapper rehydrates the IpcError so `.code` is present here.
      const isBusy =
        window.electronAPI.errors.isIpcError(err) && err.code === 'metadata.enrich_busy';
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

  const fieldRows = useMemo<IEnrichFieldRow[]>(() => {
    if (state.kind !== 'found') return [];
    return FIELD_ORDER.filter(key => state.updatedFields[key] !== undefined).map(key => {
      const proposed = state.updatedFields[key];
      const current =
        key === 'albumArt' ? track?.albumArt : (track?.[key as keyof typeof track] as unknown);
      return { key, current, proposed };
    });
  }, [state, track]);

  return {
    t,
    hasTrack: Boolean(track),
    trackTitle: track?.title ?? '',
    trackArtist: track?.artist ?? '',
    trackAlbumArt: track?.albumArt,
    state,
    fieldRows,
    writeToFile,
    setWriteToFile,
    applying,
    runPreview: () => {
      void runPreview();
    },
    handleApply: () => {
      void handleApply();
    },
    handleClose,
  };
}
