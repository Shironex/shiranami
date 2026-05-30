import { EditTagsDialog } from './EditTagsDialog';
import { useDialogEventBridge } from '@/hooks/useDialogEventBridge';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';

interface EditTagsRequest {
  trackId: string;
}

/**
 * Singleton mounted at the app root. Listens for `open-edit-tags-dialog` custom
 * events (dispatched from `TrackContextMenu`) and owns the dialog's open/close
 * state. Mirrors `TrackEnrichDialogManager`.
 */
export default function EditTagsDialogManager() {
  const { open, setOpen, request } = useDialogEventBridge<EditTagsRequest>(
    DIALOG_EVENTS.openEditTags
  );

  if (!request) return null;

  return (
    <EditTagsDialog
      key={request.trackId}
      open={open}
      onOpenChange={setOpen}
      trackId={request.trackId}
    />
  );
}
