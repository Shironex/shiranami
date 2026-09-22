import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import CompanionPerch from './CompanionPerch';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import type { Track } from '@/stores/types';

const track: Track = {
  id: 'story-track',
  title: 'Night Walk',
  artist: 'Iruka',
  album: 'Tides',
  duration: 214,
  filePath: '/music/night-walk.mp3',
  bpm: 82,
  loudnessLufs: -14,
};

/**
 * companion · CompanionPerch. The primary seat: the resident sits on the
 * PlayerBar's top edge, feet overlapping the border — draggable along the
 * top edge only, with the volume/queue cluster keeping right-of-way. The
 * decorator mocks the bar strip; the perch reads the real machine, which the
 * loader puts into the listening state.
 */
const meta: Meta<typeof CompanionPerch> = {
  title: 'companion/CompanionPerch',
  component: CompanionPerch,
  parameters: {
    a11y: { test: 'error' },
  },
  loaders: [
    async () => {
      useInterfaceStore.setState({ companion: true });
      usePlaybackStore.setState({ currentTrack: track, isPlaying: true });
      return {};
    },
  ],
  decorators: [
    Story => (
      <div className="bg-background p-16 pt-24">
        <div className="glass border-t border-border/30 relative h-20 rounded-b-xl">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompanionPerch>;

/** Sitting on the shoreline while a track plays. */
export const OnTheBar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wrap = canvasElement.querySelector('[data-slot="companion-perch"]');
    await expect(wrap).toHaveAttribute('aria-hidden', 'true');
    await expect(wrap).toHaveClass('pointer-events-none');
    // The hitbox is the only interactive surface, and it exposes no role.
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
