import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AddToPlaylistButton from './AddToPlaylistButton';

describe('AddToPlaylistButton', () => {
  it('renders the trigger with its accessible name and the popover stays closed', () => {
    render(<AddToPlaylistButton trackId="t1" />);

    expect(screen.getByRole('button', { name: 'Add to playlist' })).toBeInTheDocument();
    // The picker only mounts once the popover opens — nothing to seed for a
    // closed-state render.
    expect(screen.queryByText('New Playlist')).not.toBeInTheDocument();
  });
});
