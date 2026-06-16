import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ShareDialog from './ShareDialog';

describe('ShareDialog', () => {
  it('renders the track share title and rests in the loading state', () => {
    render(<ShareDialog open onOpenChange={vi.fn()} type="track" id="track-1" />);

    // The dialog header renders (Radix portals to document.body — screen still finds it).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Without a live backend the share-link hook stays in its loading frame.
    expect(screen.getByText('Creating share link...')).toBeInTheDocument();
  });

  it('does not render its contents when closed', () => {
    render(<ShareDialog open={false} onOpenChange={vi.fn()} type="playlist" id="playlist-1" />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
