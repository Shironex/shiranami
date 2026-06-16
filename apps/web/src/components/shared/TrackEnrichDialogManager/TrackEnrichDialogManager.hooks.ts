import { useDialogEventBridge } from '@/hooks/useDialogEventBridge';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import type {
  ITrackEnrichDialogManagerView,
  ITrackEnrichRequest,
} from './TrackEnrichDialogManager.types';

export function useTrackEnrichDialogManager(): ITrackEnrichDialogManagerView {
  const { open, setOpen, request } = useDialogEventBridge<ITrackEnrichRequest>(
    DIALOG_EVENTS.openTrackEnrich
  );

  return { open, setOpen, request };
}
