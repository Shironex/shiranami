import { EditTagsDialog } from '@/components/shared/EditTagsDialog';
import { useEditTagsDialogManager } from './EditTagsDialogManager.hooks';

/**
 * Singleton mounted at the app root. Listens for `open-edit-tags-dialog` custom
 * events (dispatched from `TrackContextMenu`) and owns the dialog's open/close
 * state. Mirrors `TrackEnrichDialogManager`.
 */
export default function EditTagsDialogManager() {
  const { open, setOpen, request } = useEditTagsDialogManager();

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
