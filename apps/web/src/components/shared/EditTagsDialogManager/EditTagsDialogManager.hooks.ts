import { useDialogEventBridge } from '@/hooks/useDialogEventBridge';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import type { IEditTagsDialogManagerView, IEditTagsRequest } from './EditTagsDialogManager.types';

export function useEditTagsDialogManager(): IEditTagsDialogManagerView {
  const { open, setOpen, request } = useDialogEventBridge<IEditTagsRequest>(
    DIALOG_EVENTS.openEditTags
  );

  return { open, setOpen, request };
}
