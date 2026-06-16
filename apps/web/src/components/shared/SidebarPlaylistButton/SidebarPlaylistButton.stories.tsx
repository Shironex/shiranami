import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { Playlist } from '@/types/electron';

import SidebarPlaylistButton from './SidebarPlaylistButton';

const playlist: Playlist = {
  id: 'pl-1',
  name: 'Late Night Lo-fi',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

/**
 * shared · SidebarPlaylistButton. A single playlist row in the sidebar, driven by
 * `collapsed`: expanded shows the cover thumbnail plus the name; collapsed shows
 * just the thumbnail with the name exposed via title/aria-label.
 */
const meta: Meta<typeof SidebarPlaylistButton> = {
  title: 'shared/SidebarPlaylistButton',
  component: SidebarPlaylistButton,
  args: {
    playlist,
    isActive: false,
    onNavigate: fn(),
    onContextMenu: fn(),
  },
  decorators: [
    Story => (
      <div className="w-56 p-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidebarPlaylistButton>;

export const Expanded: Story = {
  args: { collapsed: false },
};

export const Collapsed: Story = {
  args: { collapsed: true },
};

export const Active: Story = {
  args: { collapsed: false, isActive: true },
};
