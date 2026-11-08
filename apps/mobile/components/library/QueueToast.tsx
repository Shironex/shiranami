import { UndoToast } from '@/components/ui/undo-toast';
import { useQueueToastStore } from '@/stores/useQueueToastStore';
import { useRemovalStore } from '@/stores/useRemovalStore';

/** Gap that lifts this toast above "Removed · Undo" when both are up. */
const STACK_GAP = 56;

/** "Playing next · Undo" after a song is swiped into the queue. */
export function QueueToast({ bottom }: { bottom: number }) {
  const toast = useQueueToastStore(s => s.toast);
  const undo = useQueueToastStore(s => s.undo);
  const removing = useRemovalStore(s => s.pending !== null);
  if (!toast) return null;
  return (
    <UndoToast
      key={toast.key}
      label={toast.text}
      bottom={removing ? bottom + STACK_GAP : bottom}
      undoLabel="Undo play next"
      onUndo={undo}
    />
  );
}
