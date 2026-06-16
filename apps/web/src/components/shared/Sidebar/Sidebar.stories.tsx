import type { Meta, StoryObj } from '@storybook/react-vite';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';

import Sidebar from './Sidebar';

/**
 * shared · Sidebar. The app's left navigation rail: the logo/home button, the
 * collapse toggle, the ordered top-level nav (hidden items dropped), an optional
 * playlists section, and a version label. Order/collapse/visibility live in
 * `useUIStore`; the active view + selected playlist live in `useViewStore`; its
 * resizable width lives in `usePanelSizeStore`; playlists come from
 * `usePlaylistsQuery` (empty in the browser run, where IPC is unavailable).
 */
const meta: Meta<typeof Sidebar> = {
  title: 'shared/Sidebar',
  component: Sidebar,
  decorators: [
    Story => (
      <div className="flex h-[40rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Sidebar>;

/** Expanded rail with the library view active. */
export const Expanded: Story = {
  beforeEach: () => {
    useUIStore.setState({ sidebarCollapsed: false, sidebarPlaylistsVisible: true });
    useViewStore.setState({ activeView: 'library' });
  },
};

/** Collapsed to the icon rail. */
export const Collapsed: Story = {
  beforeEach: () => {
    useUIStore.setState({ sidebarCollapsed: true, sidebarPlaylistsVisible: true });
    useViewStore.setState({ activeView: 'favorites' });
  },
};
