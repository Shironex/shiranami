import { useEffect, useState } from 'react';
import { TrackEnrichDialog } from './TrackEnrichDialog';

interface TrackEnrichRequest {
  trackId: string;
}

/**
 * Singleton mounted at the app root. Listens for `open-track-enrich-dialog`
 * custom events (dispatched from `TrackContextMenu`) and owns the dialog's
 * open/close state so the menu doesn't have to keep its portal alive after
 * dismissal. Mirrors `ShareDialogManager`.
 */
export default function TrackEnrichDialogManager() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<TrackEnrichRequest | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TrackEnrichRequest>).detail;
      setRequest(detail);
      setOpen(true);
    };
    window.addEventListener('open-track-enrich-dialog', handler);
    return () => window.removeEventListener('open-track-enrich-dialog', handler);
  }, []);

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
