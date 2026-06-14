import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Track } from '@/stores/types';

import ArtCollage from './ArtCollage';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    albumArt: 'https://example.com/cover.jpg',
    ...overrides,
  };
}

function makeLibrary(count: number, withArt = true): Track[] {
  return Array.from({ length: count }).map((_, i) =>
    makeTrack({ id: `track-${i}`, albumArt: withArt ? 'https://example.com/cover.jpg' : undefined })
  );
}

describe('ArtCollage', () => {
  it('renders nothing when fewer than four tracks have artwork', () => {
    const { container } = render(<ArtCollage library={makeLibrary(3)} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders a thumbnail per art track, capped at twelve', () => {
    const { container } = render(<ArtCollage library={makeLibrary(20)} />);

    expect(container.querySelectorAll('img')).toHaveLength(12);
  });

  it('ignores tracks without album art', () => {
    const { container } = render(
      <ArtCollage library={[...makeLibrary(5, true), ...makeLibrary(5, false)]} />
    );

    expect(container.querySelectorAll('img')).toHaveLength(5);
  });
});
