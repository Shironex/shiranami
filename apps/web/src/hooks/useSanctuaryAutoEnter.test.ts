import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';
import { useSanctuaryAutoEnter } from './useSanctuaryAutoEnter';

function reset(): void {
  usePlaybackStore.setState({ isPlaying: false });
  useCompactStore.setState({ compactMode: false });
  useSanctuaryStore.setState({
    sanctuaryActive: false,
    sanctuaryAutoEntered: false,
    sanctuaryAutoEnter: false,
    sanctuaryAutoEnterMinutes: 5,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  reset();
});

afterEach(() => {
  vi.useRealTimers();
  reset();
});

describe('useSanctuaryAutoEnter', () => {
  it('enters as a screensaver after the stillness window while playing', () => {
    usePlaybackStore.setState({ isPlaying: true });
    useSanctuaryStore.setState({ sanctuaryAutoEnter: true, sanctuaryAutoEnterMinutes: 5 });

    renderHook(() => useSanctuaryAutoEnter());

    vi.advanceTimersByTime(5 * 60_000);

    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(true);
    expect(useSanctuaryStore.getState().sanctuaryAutoEntered).toBe(true);
  });

  it('never fires while opted out, paused, or in compact mode', () => {
    // Opted out.
    usePlaybackStore.setState({ isPlaying: true });
    const { unmount } = renderHook(() => useSanctuaryAutoEnter());
    vi.advanceTimersByTime(60 * 60_000);
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);
    unmount();

    // Opted in but paused.
    useSanctuaryStore.setState({ sanctuaryAutoEnter: true });
    usePlaybackStore.setState({ isPlaying: false });
    const paused = renderHook(() => useSanctuaryAutoEnter());
    vi.advanceTimersByTime(60 * 60_000);
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);
    paused.unmount();

    // Opted in and playing, but compact.
    usePlaybackStore.setState({ isPlaying: true });
    useCompactStore.setState({ compactMode: true });
    const compact = renderHook(() => useSanctuaryAutoEnter());
    vi.advanceTimersByTime(60 * 60_000);
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);
    compact.unmount();
  });

  it('activity resets the stillness timer', () => {
    usePlaybackStore.setState({ isPlaying: true });
    useSanctuaryStore.setState({ sanctuaryAutoEnter: true, sanctuaryAutoEnterMinutes: 5 });

    renderHook(() => useSanctuaryAutoEnter());

    vi.advanceTimersByTime(4 * 60_000);
    window.dispatchEvent(new Event('pointermove'));
    vi.advanceTimersByTime(4 * 60_000);

    // 8 minutes elapsed but never 5 without activity.
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);

    vi.advanceTimersByTime(60_000 + 1);
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(true);
  });

  it('defers entry while a dialog portal is open, then fires later', () => {
    usePlaybackStore.setState({ isPlaying: true });
    useSanctuaryStore.setState({ sanctuaryAutoEnter: true, sanctuaryAutoEnterMinutes: 5 });

    const portal = document.createElement('div');
    portal.setAttribute('data-radix-portal', '');
    document.body.appendChild(portal);

    renderHook(() => useSanctuaryAutoEnter());

    vi.advanceTimersByTime(5 * 60_000);
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(false);

    portal.remove();
    vi.advanceTimersByTime(5 * 60_000);
    expect(useSanctuaryStore.getState().sanctuaryActive).toBe(true);
  });
});
