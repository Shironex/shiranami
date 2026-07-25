import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SmartPlaylist } from '@shiranami/contracts';

import SmartPlaylistCard from './SmartPlaylistCard';

function makePlaylist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: 'sp-1',
    name: 'Late-night focus',
    description: null,
    matchType: 'all',
    rules: [{ field: 'genre', operator: 'is', value: 'lofi' }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('SmartPlaylistCard', () => {
  it('renders the playlist name inside a single button', () => {
    render(<SmartPlaylistCard playlist={makePlaylist()} onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Late-night focus/ })).toBeInTheDocument();
  });

  it('renders the singular rule summary for a one-rule playlist', () => {
    render(<SmartPlaylistCard playlist={makePlaylist()} onOpen={vi.fn()} />);

    expect(screen.getByText('1 rule')).toBeInTheDocument();
  });

  it('renders the plural rule summary for a multi-rule playlist', () => {
    const playlist = makePlaylist({
      rules: [
        { field: 'genre', operator: 'is', value: 'lofi' },
        { field: 'playCount', operator: 'greaterThan', value: '5' },
        { field: 'year', operator: 'lessThan', value: '2020' },
      ],
    });
    render(<SmartPlaylistCard playlist={playlist} onOpen={vi.fn()} />);

    expect(screen.getByText('3 rules')).toBeInTheDocument();
  });

  it('calls onOpen with the playlist id when clicked', async () => {
    const onOpen = vi.fn();
    render(<SmartPlaylistCard playlist={makePlaylist({ id: 'sp-42' })} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('sp-42');
  });

  it('hides the decorative sparkle icon from assistive tech', () => {
    const { container } = render(<SmartPlaylistCard playlist={makePlaylist()} onOpen={vi.fn()} />);

    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
