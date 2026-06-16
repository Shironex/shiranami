import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
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

/** Seed the playback store the leaf reads so its effects run against real data. */
function seedPlayback(): void {
  usePlaybackStore.setState({
    currentTrack: makeTrack(),
    isPlaying: true,
    currentTime: 42,
    duration: 215,
  });
}

/**
 * player · MediaSessionSync. A headless side-effect leaf: it subscribes to
 * playback state and pushes position/playback-state to `navigator.mediaSession`
 * (and, under Electron, to the main process via IPC), then renders nothing. It
 * is isolated as its own component so the per-250ms currentTime updates re-render
 * only this leaf, not the App tree. There is no visible UI and no accessible
 * content — the story exists to prove the effects mount without throwing.
 */
const meta: Meta<typeof MediaSessionSync> = {
  title: 'player/MediaSessionSync',
  component: MediaSessionSync,
  // a11y stays at the global 'todo' default: this component renders null, so
  // there is no DOM for axe to audit.
  parameters: { layout: 'centered' },
};

export default meta;

type Story = StoryObj<typeof MediaSessionSync>;

/**
 * The component renders nothing — this story exercises its media-session
 * side-effects in isolation and asserts the surface stays blank (no throw).
 */
export const Default: Story = {
  decorators: [
    Story => {
      seedPlayback();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    // Headless: it mounted (the canvas root exists) but contributes no DOM of
    // its own — there is nothing visible to assert beyond a clean mount.
    await expect(canvasElement).toBeTruthy();
    await expect(canvasElement).toBeEmptyDOMElement();
  },
};
