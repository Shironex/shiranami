import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';

import EditTagsDialogManager from './EditTagsDialogManager';

const TRACK = {
  id: 'track-1',
  title: 'Midnight Study Session',
  artist: 'Lofi Collective',
  album: 'Late Nights',
  duration: 184,
  filePath: '/music/midnight.mp3',
};

describe('EditTagsDialogManager', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [TRACK] });
  });

  it('renders no dialog at rest', () => {
    render(<EditTagsDialogManager />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the edit-tags dialog when an open-edit-tags-dialog event fires', () => {
    render(<EditTagsDialogManager />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(DIALOG_EVENTS.openEditTags, { detail: { trackId: 'track-1' } })
      );
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Tags')).toBeInTheDocument();
  });
});
