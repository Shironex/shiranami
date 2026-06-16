import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import NowPlayingHero from './NowPlayingHero';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 184,
    filePath: '/music/midnight.mp3',
    ...overrides,
  } as Track;
}

/**
 * shared · NowPlayingHero. An animated "now playing" banner — album artwork
 * (with an optional blurred backdrop) beside the track title/artist/album, with
 * an enter-now-playing affordance on double-click. Reads the current track from
 * `usePlaybackStore`; renders nothing when nothing is playing or the optional
 * `show` predicate fails. Stories seed the playback store.
 */
const meta: Meta<typeof NowPlayingHero> = {
  title: 'shared/NowPlayingHero',
  component: NowPlayingHero,
};

export default meta;

type Story = StoryObj<typeof NowPlayingHero>;

/** A track is playing — the hero renders with its title and artist/album line. */
export const Playing: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ currentTrack: makeTrack() });
  },
};

/** Nothing playing — the hero collapses to nothing. */
export const Idle: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ currentTrack: null });
  },
};
