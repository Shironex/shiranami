import type { RenderResult } from '@testing-library/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Playlist } from '@/types/electron';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistSubmenu from './PlaylistSubmenu';

const CLOSE_DELAY_MS = 300;

function makePlaylist(id: string, name: string): Playlist {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  };
}

/** Seeded so the picker settles on its real list instead of the IPC spinner. */
function renderSubmenu(onClose: () => void = vi.fn()): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(playlistKeys.all, [
    makePlaylist('p1', 'Late night'),
    makePlaylist('p2', 'Focus flow'),
  ]);
  client.setQueryData([...playlistKeys.all, 'membership', ['t1']], ['p1']);

  return render(
    <QueryClientProvider client={client}>
      <PlaylistSubmenu trackIds={['t1']} onClose={onClose} />
    </QueryClientProvider>
  );
}

function row(): HTMLElement {
  return screen.getByText('Add to Playlist');
}

/**
 * React derives `onMouseEnter`/`onMouseLeave` from delegated `mouseover` /
 * `mouseout`, so the fake-timer cases drive those directly — `userEvent`'s own
 * pointer sequencing deadlocks against a faked clock.
 */
function enterRow(): void {
  fireEvent.mouseOver(row());
}

function leaveRow(): void {
  fireEvent.mouseOut(row(), { relatedTarget: document.body });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PlaylistSubmenu', () => {
  it('renders the collapsed row without mounting the picker', () => {
    renderSubmenu();

    expect(row()).toBeInTheDocument();
    expect(screen.queryByText('Late night')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Playlist' })).toBeNull();
  });

  it('opens the fly-out on hover with the playlist picker inside', async () => {
    const user = userEvent.setup();
    renderSubmenu();

    await user.hover(row());

    expect(await screen.findByText('Late night')).toBeInTheDocument();
    expect(screen.getByText('Focus flow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Playlist' })).toBeInTheDocument();
  });

  it('opens the fly-out to the right when there is room beside the row', async () => {
    const user = userEvent.setup();
    const { container } = renderSubmenu();

    await user.hover(row());
    await screen.findByText('Late night');

    // Opening to the right anchors the panel's left edge to the row's right one.
    expect(container.querySelector('.left-full')).not.toBeNull();
    expect(container.querySelector('.right-full')).toBeNull();
  });

  it('flips the fly-out to the left when the row sits near the right edge', async () => {
    const originalWidth = window.innerWidth;
    // The 192px panel cannot fit to the right of the row in a 100px viewport.
    Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
    const user = userEvent.setup();
    const { container } = renderSubmenu();

    await user.hover(row());
    await screen.findByText('Late night');

    // Flipped: the panel's right edge now anchors to the row's left one.
    expect(container.querySelector('.right-full')).not.toBeNull();
    expect(container.querySelector('.left-full')).toBeNull();

    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
  });

  it('holds the fly-out open through the grace period, then closes', () => {
    vi.useFakeTimers();
    renderSubmenu();

    enterRow();
    expect(screen.getByText('Late night')).toBeInTheDocument();

    leaveRow();
    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS - 1);
    });
    // Still open — the pointer is given time to travel into the panel.
    expect(screen.getByText('Late night')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Late night')).toBeNull();
  });

  it('cancels the pending close when the pointer comes back', () => {
    vi.useFakeTimers();
    renderSubmenu();

    enterRow();
    expect(screen.getByText('Late night')).toBeInTheDocument();

    leaveRow();
    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS - 100);
    });
    enterRow();

    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    });
    expect(screen.getByText('Late night')).toBeInTheDocument();
  });
});
