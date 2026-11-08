import { UndoToast } from '@/components/ui/undo-toast';
import { useRemovalStore } from '@/stores/useRemovalStore';

/** "Removed · Undo" over the bottom of the screen while a removal can still be undone. */
export function RemovalToast({ bottom }: { bottom: number }) {
  const pending = useRemovalStore(s => s.pending);
  const undo = useRemovalStore(s => s.undo);
  if (!pending) return null;

  const label =
    pending.tracks.length === 1 ? `Removed ${pending.tracks[0].title}` : 'Removed songs';
  return (
    <UndoToast label={label} bottom={bottom} undoLabel="Undo remove" onUndo={() => void undo()} />
  );
}
