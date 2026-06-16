import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import CommandPalette from './CommandPalette';

// cmdk scrolls the active item into view on mount; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 120,
    filePath: '/music/lofi.mp3',
    ...overrides,
  } as Track;
}

function seedLibrary(tracks: Track[]): void {
  useLibraryStore.setState({ library: tracks });
}

beforeEach(() => {
  seedLibrary([]);
});

afterEach(() => {
  seedLibrary([]);
});

describe('CommandPalette', () => {
  it('mounts closed — no search input is rendered until the shortcut fires', () => {
    render(<CommandPalette />);

    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  });

  it('opens on Cmd/Ctrl+K and lists seeded library tracks', () => {
    seedLibrary([makeTrack({ id: 'a', title: 'Midnight study session' })]);
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    // The palette dialog is now open with its search input and the track row.
    expect(screen.getByText('Midnight study session')).toBeInTheDocument();
  });
});
