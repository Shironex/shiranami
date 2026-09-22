import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { roomLightForHour, roomLightLayerStyle } from '@/hooks/useRoomLight';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import AmbientBackground from './AmbientBackground';

/** Inline SVG cover so the bloom has canvas-free pixels without network access. */
const STORY_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
      `<rect width="240" height="240" fill="%23342a56"/>` +
      `<circle cx="70" cy="80" r="60" fill="%239b7deb"/>` +
      `<circle cx="180" cy="170" r="80" fill="%23f09e60"/>` +
      `</svg>`
  );

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
 * shared · AmbientBackground. The artwork bloom — four blurred, saturated,
 * slowly counter-rotating copies of the current cover — painted behind the
 * shell, with a color-glow fallback for artless tracks, the film-grain noise
 * overlay, and the room-light time-of-day grade. Seeded with a playing track
 * (and low-performance mode off) so the layers render. The component's own
 * room-light layer follows the wall clock, so the base stories disable it and
 * the per-stop stories pin an hour instead — every story stays deterministic.
 */
const meta: Meta<typeof AmbientBackground> = {
  title: 'shared/AmbientBackground',
  component: AmbientBackground,
  decorators: [
    Story => {
      useUIStore.setState({
        lowPerformanceMode: false,
        noiseOverlayEnabled: true,
        roomLightEnabled: false,
      });
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

/** A track with cover art: the four-layer artwork bloom. */
export const Default: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({ currentTrack: { ...track, albumArt: STORY_COVER } });
      return <Story />;
    },
  ],
};

/** A track with a stored BPM: the layer set swells once a bar (tempo breathing). */
export const Breathing: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({
        currentTrack: { ...track, albumArt: STORY_COVER, bpm: 80 },
      });
      return <Story />;
    },
  ],
};

/** A track without art falls back to the extracted-color glow. */
export const GlowFallback: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({ currentTrack: track });
      return <Story />;
    },
  ],
};

/**
 * A room-light stop pinned to a fixed hour: the component's clock-driven layer
 * stays off (meta decorator) and the story paints the exact same layer markup
 * with the stop's custom properties, over the seeded artwork bloom.
 */
function roomLightStopStory(hour: number): Story {
  return {
    decorators: [
      Story => {
        usePlaybackStore.setState({ currentTrack: { ...track, albumArt: STORY_COVER } });
        const style = roomLightLayerStyle(roomLightForHour(hour));
        return (
          <>
            <Story />
            <div
              className="room-light fixed inset-0 pointer-events-none z-0"
              data-slot="room-light"
              aria-hidden="true"
              style={style}
            />
          </>
        );
      },
    ],
  };
}

/** 06:00 — cool blue-grey early-morning light. */
export const RoomLightDawn: Story = roomLightStopStory(6);

/** 12:00 — neutral daylight, the grade nearly invisible. */
export const RoomLightDay: Story = roomLightStopStory(12);

/** 18:00 — golden-hour amber wash around sunset. */
export const RoomLightGoldenHour: Story = roomLightStopStory(18);

/** 21:00 — dusk: the wash cools down while the desk lamp starts to glow. */
export const RoomLightDusk: Story = roomLightStopStory(21);

/** 23:00 — night: a slightly dimmer scene lit by the warm desk-lamp corner. */
export const RoomLightNight: Story = roomLightStopStory(23);
