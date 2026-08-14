import { render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';

import AmbientBackground from './AmbientBackground';
import { ART_BLOOM_LAYERS, useAmbientBackground } from './AmbientBackground.hooks';

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

afterEach(() => {
  usePlaybackStore.setState({ currentTrack: null, crossfadeEnabled: false });
  useUIStore.setState({
    lowPerformanceMode: false,
    noiseOverlayEnabled: false,
    tempoBreathingEnabled: true,
    artworkBloomEnabled: true,
    coverCrossfadeEnabled: true,
    roomLightEnabled: true,
  });
});

describe('AmbientBackground', () => {
  it('renders nothing in low-performance mode', () => {
    useUIStore.setState({ lowPerformanceMode: true, noiseOverlayEnabled: true });

    const { container } = render(<AmbientBackground />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the noise overlay when enabled', () => {
    useUIStore.setState({ lowPerformanceMode: false, noiseOverlayEnabled: true });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('.noise')).not.toBeNull();
  });

  it('omits the noise overlay when disabled', () => {
    useUIStore.setState({ lowPerformanceMode: false, noiseOverlayEnabled: false });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('.noise')).toBeNull();
  });

  it('renders one bloom layer per configured copy when the track has art', () => {
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg' },
    });

    const { container } = render(<AmbientBackground />);

    const bloom = container.querySelector('[data-slot="art-bloom"]');
    expect(bloom).not.toBeNull();
    expect(bloom!.querySelectorAll('img')).toHaveLength(ART_BLOOM_LAYERS.length);
    // The bloom replaces the glow, not stacks on it.
    expect(container.querySelector('[data-slot="ambient-glow"]')).toBeNull();
  });

  it('falls back to the color glow when the track has no art', () => {
    usePlaybackStore.setState({ currentTrack: track });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('[data-slot="ambient-glow"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="art-bloom"]')).toBeNull();
  });

  it('cross-dissolves on a track change: one incoming and one outgoing layer', () => {
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/aaa.jpg' },
    });
    const { container, rerender } = render(<AmbientBackground />);

    usePlaybackStore.setState({
      currentTrack: { ...track, id: 'track-2', albumArt: 'http://127.0.0.1:1/art/bbb.jpg' },
    });
    rerender(<AmbientBackground />);

    expect(container.querySelector('[data-slot="art-bloom"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="art-bloom-outgoing"]')).not.toBeNull();
  });

  it('replaces the outgoing layer on a rapid skip instead of stacking', () => {
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/aaa.jpg' },
    });
    const { container, rerender } = render(<AmbientBackground />);

    for (const id of ['b', 'c', 'd', 'e']) {
      usePlaybackStore.setState({
        currentTrack: { ...track, id, albumArt: `http://127.0.0.1:1/art/${id}.jpg` },
      });
      rerender(<AmbientBackground />);
    }

    // Five fast skips: exactly one incoming + one outgoing, never a pile.
    expect(container.querySelectorAll('[data-slot="art-bloom"]')).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-slot="art-bloom-outgoing"]').length
    ).toBeLessThanOrEqual(1);
  });

  it('breathes the bloom when the track has a stored BPM', () => {
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg', bpm: 80 },
    });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('[data-slot="art-bloom"] .bloom-breathe')).not.toBeNull();
  });

  it('keeps the fixed drift when the track has no BPM', () => {
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg' },
    });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('[data-slot="art-bloom"]')).not.toBeNull();
    expect(container.querySelector('.bloom-breathe')).toBeNull();
  });

  it('does not breathe when the settings toggle is off', () => {
    useUIStore.setState({ tempoBreathingEnabled: false });
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg', bpm: 80 },
    });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('.bloom-breathe')).toBeNull();
  });

  it('does not breathe in low-performance mode fallback paths', () => {
    // Low-perf unmounts the whole layer; the guard here is that the derived
    // breathing flag also respects the decorative-motion gate, so a future
    // partial-render path cannot leak a tempo-locked animation.
    useUIStore.setState({ lowPerformanceMode: true });
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg', bpm: 80 },
    });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('.bloom-breathe')).toBeNull();
  });

  it('hides the artwork bloom and falls back to the glow when the bloom toggle is off', () => {
    useUIStore.setState({ artworkBloomEnabled: false });
    usePlaybackStore.setState({
      currentTrack: { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg' },
    });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('[data-slot="art-bloom"]')).toBeNull();
    // The background never goes flat black: the color glow takes over.
    expect(container.querySelector('[data-slot="ambient-glow"]')).not.toBeNull();
  });

  it('renders the room-light grade layer with the stop custom properties', () => {
    const { container } = render(<AmbientBackground />);

    const layer = container.querySelector<HTMLElement>('[data-slot="room-light"]');
    expect(layer).not.toBeNull();
    expect(layer!.style.getPropertyValue('--room-light-tint')).toContain('color-mix');
    expect(layer!.style.getPropertyValue('--room-light-lamp')).not.toBe('');
  });

  it('omits the room-light layer when the toggle is off', () => {
    useUIStore.setState({ roomLightEnabled: false });

    const { container } = render(<AmbientBackground />);

    expect(container.querySelector('[data-slot="room-light"]')).toBeNull();
  });

  it('keeps every drift period in minutes, never seconds', () => {
    // The calm contract: rotation slower than once per five minutes for every
    // layer. A "faster" tuning pass would flip this from ambience to motion.
    for (const layer of ART_BLOOM_LAYERS) {
      expect(layer.duration).toBeGreaterThanOrEqual(300);
    }
  });
});

describe('useAmbientBackground gating', () => {
  const artTrack: Track = { ...track, albumArt: 'http://127.0.0.1:1/art/abc.jpg' };

  it('makes the cross-dissolve instant when cover crossfade is off', () => {
    useUIStore.setState({ coverCrossfadeEnabled: false });
    usePlaybackStore.setState({
      currentTrack: artTrack,
      crossfadeEnabled: true,
      crossfadeDuration: 5,
    });

    const { result } = renderHook(() => useAmbientBackground());

    // Audio crossfade only lends its duration; it cannot force the dissolve.
    expect(result.current.artFadeDuration).toBe(0);
  });

  it('spans the audio crossfade window when both crossfades are on', () => {
    usePlaybackStore.setState({
      currentTrack: artTrack,
      crossfadeEnabled: true,
      crossfadeDuration: 5,
    });

    const { result } = renderHook(() => useAmbientBackground());

    expect(result.current.artFadeDuration).toBe(5);
  });

  it('keeps the calm 1.2s dissolve when only the visual crossfade is on', () => {
    usePlaybackStore.setState({ currentTrack: artTrack, crossfadeEnabled: false });

    const { result } = renderHook(() => useAmbientBackground());

    expect(result.current.artFadeDuration).toBe(1.2);
  });

  it('suppresses the track-change pulse when the bloom toggle is off', () => {
    useUIStore.setState({ artworkBloomEnabled: false });
    usePlaybackStore.setState({ currentTrack: artTrack });

    const { result } = renderHook(() => useAmbientBackground());

    expect(result.current.showBloom).toBe(false);
  });

  it('keeps low-performance mode as the master kill over the bloom toggle', () => {
    useUIStore.setState({ artworkBloomEnabled: true, lowPerformanceMode: true });
    usePlaybackStore.setState({ currentTrack: artTrack });

    const { result } = renderHook(() => useAmbientBackground());

    expect(result.current.enabled).toBe(false);
    expect(result.current.showBloom).toBe(false);
    expect(result.current.bloomSlots.current).toBeNull();
  });

  it('keeps low-performance mode as the master kill over the room-light toggle', () => {
    useUIStore.setState({ roomLightEnabled: true, lowPerformanceMode: true });

    const { result } = renderHook(() => useAmbientBackground());

    expect(result.current.roomLightStyle).toBeNull();
  });
});
