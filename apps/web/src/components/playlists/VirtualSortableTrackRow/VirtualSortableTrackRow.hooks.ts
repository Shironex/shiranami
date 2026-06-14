import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RowComponentProps } from 'react-window';
import type { Track } from '@/stores/types';
import type {
  IVirtualSortableTrackRowProps,
  IVirtualSortableTrackRowView,
} from './VirtualSortableTrackRow.types';

export function useVirtualSortableTrackRow(
  props: RowComponentProps<IVirtualSortableTrackRowProps>
): IVirtualSortableTrackRowView {
  const { t } = useTranslation('contextMenu');
  const {
    index,
    style,
    tracks,
    currentTrack,
    isPlaying,
    onPlayTrack,
    onToggleFavorite,
    onRemoveTrack,
  } = props;

  const track: Track | undefined = tracks[index];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track?.id ?? `empty-${index}`,
  });

  // react-window positions each row with its own `transform: translateY(...)`
  // inside `style`. The sortable transform must compose with — not clobber —
  // that positioning, so the outer element keeps react-window's `style`
  // untouched and the sortable ref + reorder transform ride on an inner div.
  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : undefined,
  };

  return {
    track,
    tracks,
    index,
    currentTrack,
    isPlaying,
    style,
    sortableStyle,
    setNodeRef,
    attributes,
    listeners,
    dragLabel: t('dragToReorder'),
    onPlayTrack,
    onToggleFavorite,
    onRemoveTrack,
  };
}
