import type { RowComponentProps } from 'react-window';
import type { ITrackRowProps, ITrackRowView } from './TrackRow.types';

/**
 * Resolves the track for the row at `index`. `react-window` spreads the list's
 * `rowProps` flat onto the component alongside `index`/`style`, so the queue is
 * read off the flattened props and indexed here.
 */
export function useTrackRow(props: RowComponentProps<ITrackRowProps>): ITrackRowView {
  const { index, queue } = props as RowComponentProps<ITrackRowProps> & ITrackRowProps;
  return { track: queue[index] ?? null };
}
