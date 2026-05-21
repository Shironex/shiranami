import { TrackEnrichDialog } from './TrackEnrichDialog';
import { useDialogEventBridge } from '@/hooks/useDialogEventBridge';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';

interface TrackEnrichRequest {
  trackId: string;
}

/**
 * Singleton mounted at the app root. Listens for `open-track-enrich-dialog`
 * custom events (dispatched from `TrackContextMenu`) and owns the dialog's
 * open/close state so the menu doesn't have to keep its portal alive after
 * dismissal. Mirrors `ShareDialogManager` — both go through
 * `useDialogEventBridge`.
 */
export default function TrackEnrichDialogManager() {
  const { open, setOpen, request } = useDialogEventBridge<TrackEnrichRequest>(
    DIALOG_EVENTS.openTrackEnrich
  );

  if (!request) return null;

  return (
    <TrackEnrichDialog
      key={request.trackId}
      open={open}
      onOpenChange={setOpen}
      trackId={request.trackId}
    />
  );
}
