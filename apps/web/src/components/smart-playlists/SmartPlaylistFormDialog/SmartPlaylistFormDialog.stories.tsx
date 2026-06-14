import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SmartPlaylist } from '@shiranami/contracts';

import SmartPlaylistFormDialog from './SmartPlaylistFormDialog';

const samplePlaylist: SmartPlaylist = {
  id: 'sp-1',
  name: 'Late-night focus',
  description: null,
  matchType: 'all',
  rules: [
    { field: 'genre', operator: 'is', value: 'lofi' },
    { field: 'playCount', operator: 'greaterThan', value: '5' },
  ],
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
};

const meta: Meta<typeof SmartPlaylistFormDialog> = {
  title: 'smart-playlists/SmartPlaylistFormDialog',
  component: SmartPlaylistFormDialog,
  args: {
    open: true,
    onOpenChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SmartPlaylistFormDialog>;

export const Default: Story = {};

export const Edit: Story = {
  args: {
    playlist: samplePlaylist,
  },
};
