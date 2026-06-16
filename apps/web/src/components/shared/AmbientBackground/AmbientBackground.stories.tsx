import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import AmbientBackground from './AmbientBackground';

const track: Track = {
  id: 'track-1',
  title: 'Lofi beats to relax and study to',
  artist: 'Chillhop',
  album: 'Essentials',
  duration: 215,
  filePath: '/music/test.mp3',
  albumArt: undefined,
  isFavorite: false,
};

/**
 * shared · AmbientBackground. The slow album-art color glow + film-grain noise
 * overlay painted behind the shell. Seeded with a playing track and the noise
 * overlay enabled (and low-performance mode off) so both layers render.
 */
const meta: Meta<typeof AmbientBackground> = {
  title: 'shared/AmbientBackground',
  component: AmbientBackground,
  decorators: [
    Story => {
      useUIStore.setState({ lowPerformanceMode: false, noiseOverlayEnabled: true });
      usePlaybackStore.setState({ currentTrack: track });
      return (
        <div className="relative w-full h-64">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof AmbientBackground>;

export const Default: Story = {};
