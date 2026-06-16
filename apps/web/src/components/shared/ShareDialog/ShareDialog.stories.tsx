import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import ShareDialog from './ShareDialog';

/**
 * shared · ShareDialog. A modal that mints a time-limited share link for a track
 * or playlist, showing a loading state, the URL with a copy button, a QR code,
 * and an expiry note (or an error state with retry). Driven by `useShareLink`,
 * which is an IPC no-op in the browser run, so the dialog rests in its loading
 * state. Rendered open so the modal is visible in the canvas.
 */
const meta: Meta<typeof ShareDialog> = {
  title: 'shared/ShareDialog',
  component: ShareDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    type: 'track',
    id: 'track-1',
  },
};

export default meta;

type Story = StoryObj<typeof ShareDialog>;

/** Sharing a single track — rests in the loading state without a live backend. */
export const Default: Story = {};

/** Sharing a whole playlist — the title switches to the playlist copy. */
export const Playlist: Story = {
  args: { type: 'playlist', id: 'playlist-1' },
};
