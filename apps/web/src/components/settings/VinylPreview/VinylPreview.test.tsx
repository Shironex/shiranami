import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';

import VinylPreview from './VinylPreview';

const NOW_PLAYING_WRAP = '[data-slot="vinyl-preview-now-playing"]';
const SANCTUARY_WRAP = '[data-slot="vinyl-preview-sanctuary"]';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    title: 'Track 1',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/1.mp3',
    isFavorite: false,
    bpm: null,
    musicalKey: null,
    ...overrides,
  };
}

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  useUIStore.setState({
    vinylLabelSource: 'artwork',
    vinylRingStyle: 'glow',
    vinylSpeed: '33',
    vinylFinish: 'black',
    vinylTonearmEnabled: false,
    vinylNowPlayingSize: 'large',
    vinylSanctuarySize: 'medium',
    lowPerformanceMode: false,
  });
}

beforeEach(reset);
afterEach(reset);

describe('VinylPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<VinylPreview enabled />);

    expect(screen.getByRole('img', { name: 'Vinyl preview' })).toBeInTheDocument();
  });

  it('renders one live record miniature per stage at full strength when enabled', () => {
    const { container } = render(<VinylPreview enabled />);

    expect(container.querySelectorAll('[data-slot="vinyl-record"]')).toHaveLength(2);
    expect(container.querySelector(NOW_PLAYING_WRAP)).toHaveClass('opacity-100');
    expect(container.querySelector(SANCTUARY_WRAP)).toHaveClass('opacity-100');
  });

  it('dims both stages when the display is disabled', () => {
    const { container } = render(<VinylPreview enabled={false} />);

    for (const selector of [NOW_PLAYING_WRAP, SANCTUARY_WRAP]) {
      const wrap = container.querySelector(selector);
      expect(wrap).toHaveClass('opacity-25');
      expect(wrap).not.toHaveClass('opacity-100');
    }
  });

  it('sizes each stage disc by its own preference', () => {
    useUIStore.setState({ vinylNowPlayingSize: 'small', vinylSanctuarySize: 'large' });

    const { container } = render(<VinylPreview enabled />);

    const nowPlayingDisc = container.querySelector<HTMLElement>(`${NOW_PLAYING_WRAP} > div`);
    const sanctuaryDisc = container.querySelector<HTMLElement>(`${SANCTUARY_WRAP} > div`);
    expect(nowPlayingDisc!.style.width).toBe('64px');
    expect(sanctuaryDisc!.style.width).toBe('92px');
  });

  it('feeds the playing track cover to the miniatures so art choices preview live', () => {
    usePlaybackStore.setState({ currentTrack: makeTrack({ albumArt: 'art://cover.jpg' }) });

    const { container } = render(<VinylPreview enabled />);

    const covers = container.querySelectorAll('img[src="art://cover.jpg"]');
    expect(covers).toHaveLength(2);
  });
});
