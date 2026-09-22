import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAccentStore } from '@/stores/useAccentStore';
import { useUIStore } from '@/stores/useUIStore';

import { AmbientColorProvider, useAmbientColor, DEFAULT_COLOR } from './useAmbientColor';

// Deterministic average color regardless of the (mocked) image pixels.
vi.mock('fast-average-color', () => ({
  FastAverageColor: class {
    getColor() {
      return { value: [10, 20, 30], hex: '#0a141e', isDark: true };
    }
  },
}));

// jsdom has no 2d canvas, so the palette path is inert either way; pin it to
// null so the average-color contract is what these tests exercise.
vi.mock('@/lib/artPalette', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/artPalette')>();
  return { ...actual, extractPalette: () => null };
});

/** Counts constructions so tests can prove the decode pass never started. */
let imageInstances = 0;

class MockImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';

  constructor() {
    imageInstances += 1;
  }

  set src(value: string) {
    this.#src = value;
    // Fire after the effect body has assigned the handlers.
    setTimeout(() => this.onload?.(), 0);
  }

  get src() {
    return this.#src;
  }
}

const track: Track = {
  id: 'track-1',
  title: 'Test Track',
  artist: 'Tester',
  album: 'Fixtures',
  duration: 200,
  filePath: '/music/test.mp3',
  albumArt: undefined,
  isFavorite: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AmbientColorProvider>{children}</AmbientColorProvider>;
}

beforeEach(() => {
  imageInstances = 0;
  vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  usePlaybackStore.setState({ currentTrack: null });
  useUIStore.setState({ lowPerformanceMode: false });
  useAccentStore.setState({ followArtAccent: false });
});

describe('AmbientColorProvider under low performance mode', () => {
  it('extracts the ambient color from the cover when low-perf is off', async () => {
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/normal.jpg' },
    });

    const { result } = renderHook(() => useAmbientColor(), { wrapper });

    await waitFor(() => expect(result.current.hex).toBe('#0a141e'));
    expect(imageInstances).toBe(1);
  });

  it('skips the extraction pass entirely when low-perf is on', async () => {
    useUIStore.setState({ lowPerformanceMode: true });
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/lowperf.jpg' },
    });

    const { result } = renderHook(() => useAmbientColor(), { wrapper });

    // Give a would-be decode a tick to fire before asserting it never began.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    expect(result.current.hex).toBe(DEFAULT_COLOR.hex);
    expect(result.current.palette).toBeNull();
    expect(imageInstances).toBe(0);
    // No palette means no published tokens — themes keep their neutral defaults.
    expect(document.documentElement.style.getPropertyValue('--art-1')).toBe('');
  });

  it('resumes extraction when low-perf turns back off', async () => {
    useUIStore.setState({ lowPerformanceMode: true });
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/resume.jpg' },
    });

    const { result } = renderHook(() => useAmbientColor(), { wrapper });
    expect(result.current.hex).toBe(DEFAULT_COLOR.hex);

    act(() => {
      useUIStore.setState({ lowPerformanceMode: false });
    });

    await waitFor(() => expect(result.current.hex).toBe('#0a141e'));
  });

  it('lets follow-art-accent yield the stored accent instead of crashing', async () => {
    useUIStore.setState({ lowPerformanceMode: true });
    useAccentStore.setState({ followArtAccent: true, accentColor: null });
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/accent.jpg' },
    });

    renderHook(() => useAmbientColor(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    // No palette to follow: the accent override is cleared, so the preset /
    // theme accent shows through (no inline --primary override remains).
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
});
