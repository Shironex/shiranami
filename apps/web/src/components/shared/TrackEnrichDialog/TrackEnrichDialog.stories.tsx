import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useLibraryStore } from '@/stores/useLibraryStore';

import TrackEnrichDialog from './TrackEnrichDialog';

const TRACK = {
  id: 'track-1',
  title: 'Midnight Study Session',
  artist: 'Unknown Artist',
  album: 'Unknown Album',
  duration: 184,
  filePath: '/music/midnight.mp3',
};

/**
 * shared · TrackEnrichDialog. A modal that looks up missing metadata for a single
 * track, then shows a current-vs-matched diff with a confidence badge and an
 * optional "write to file" toggle, plus searching / no-match / error / applied
 * states. Reads the track from `useLibraryStore` and drives the lookup through
 * `useMetadataEnrichStore` (IPC), which resolves to an error state in the browser
 * run without a backend. The story seeds the library so the dialog renders.
 */
const meta: Meta<typeof TrackEnrichDialog> = {
  title: 'shared/TrackEnrichDialog',
  component: TrackEnrichDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trackId: 'track-1',
  },
  beforeEach: () => {
    useLibraryStore.setState({ library: [TRACK] });
  },
};

export default meta;

type Story = StoryObj<typeof TrackEnrichDialog>;

/** Opens straight into the lookup; settles on an error state without a backend. */
export const Default: Story = {};
