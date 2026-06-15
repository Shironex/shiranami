import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  IQueueRowLabels,
  ISortableQueueRowProps,
  ISortableQueueRowView,
} from './QueueRow.types';

/** Localized labels shared by the interactive queue rows. */
export function useQueueRowLabels(): IQueueRowLabels {
  const { t } = useTranslation('queue');
  return {
    remove: t('remove'),
    dragToReorder: t('dragToReorder'),
    nowPlaying: t('nowPlaying'),
  };
}

/** Sortable behavior + bound handlers for the "Up Next" row. */
export function useSortableQueueRow(props: ISortableQueueRowProps): ISortableQueueRowView {
  const { sortableId, queueIndex, onPlay, onRemove } = props;
  const labels = useQueueRowLabels();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return {
    setNodeRef,
    style,
    attributes,
    listeners,
    isDragging,
    labels,
    onPlay: () => onPlay(queueIndex),
    onRemove: (e: React.MouseEvent) => onRemove(e, queueIndex),
  };
}
