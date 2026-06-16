import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';

import EditTagsDialog from './EditTagsDialog';

const TRACK = {
  id: 'track-1',
  title: 'Midnight Study Session',
  artist: 'Lofi Collective',
  album: 'Late Nights',
  genre: 'Lofi',
  year: 2024,
  duration: 184,
  filePath: '/music/midnight.mp3',
};

describe('EditTagsDialog', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [TRACK] });
  });

  it('renders the edit-tags form seeded from the library track', () => {
    render(<EditTagsDialog open onOpenChange={vi.fn()} trackId="track-1" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Tags')).toBeInTheDocument();
    // The form is seeded from the track's current tags.
    expect(screen.getByDisplayValue('Midnight Study Session')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lofi Collective')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renders nothing when the track id is not in the library', () => {
    render(<EditTagsDialog open onOpenChange={vi.fn()} trackId="missing" />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
