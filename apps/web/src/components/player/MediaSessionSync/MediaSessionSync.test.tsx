import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import MediaSessionSync from './MediaSessionSync';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function reset(): void {
  usePlaybackStore.setState({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('MediaSessionSync', () => {
  it('renders nothing', () => {
    const { container } = render(<MediaSessionSync />);

    expect(container).toBeEmptyDOMElement();
  });

  it('sends the current playback state to the main process when a track is playing', () => {
    usePlaybackStore.setState({
      currentTrack: makeTrack(),
      isPlaying: true,
      currentTime: 42,
      duration: 215,
    });

    render(<MediaSessionSync />);

    expect(window.electronAPI.media.sendPlaybackState).toHaveBeenCalledWith(
      expect.objectContaining({
        isPlaying: true,
        title: 'Midnight Tapes',
        artist: 'Idealism',
        album: 'Late Nights',
        duration: 215,
        currentTime: 42,
      })
    );
    expect(window.electronAPI.media.clearState).not.toHaveBeenCalled();
  });

  it('clears the playback state when no track is loaded', () => {
    render(<MediaSessionSync />);

    expect(window.electronAPI.media.clearState).toHaveBeenCalled();
    expect(window.electronAPI.media.sendPlaybackState).not.toHaveBeenCalled();
  });
});
