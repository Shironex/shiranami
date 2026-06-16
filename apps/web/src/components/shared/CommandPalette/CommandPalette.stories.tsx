import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import CommandPalette from './CommandPalette';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 184,
    filePath: '/music/midnight.mp3',
    albumArt: undefined,
    ...overrides,
  } as Track;
}

/**
 * shared · CommandPalette. The global Cmd/Ctrl+K command menu: a search input
 * over navigation targets and the full library (each track queues + plays on
 * select). Owns its own open state and the global keydown listener — it mounts
 * closed (rendering nothing until the shortcut fires), so press Cmd/Ctrl+K in
 * the preview to open it. Stories seed the library store.
 */
const meta: Meta<typeof CommandPalette> = {
  title: 'shared/CommandPalette',
  component: CommandPalette,
  beforeEach: () => {
    useLibraryStore.setState({
      library: [
        makeTrack({ id: 'a', title: 'Midnight study session', artist: 'Lofi Collective' }),
        makeTrack({ id: 'b', title: 'Rainy day cafe', artist: 'Slow Mornings' }),
      ],
    });
  },
};

export default meta;

type Story = StoryObj<typeof CommandPalette>;

/** Mounts closed; press Cmd/Ctrl+K to open the palette over the seeded library. */
export const Default: Story = {};
