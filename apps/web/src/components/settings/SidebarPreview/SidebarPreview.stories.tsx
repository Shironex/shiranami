import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';
import { DEFAULT_SIDEBAR_ORDER } from '@/lib/sidebar-items';

import SidebarPreview from './SidebarPreview';

/** Reset the sidebar UI state so the mock renders the full default nav. */
function resetSidebar(): void {
  useUIStore.setState({
    sidebarHiddenItems: [],
    sidebarOrder: DEFAULT_SIDEBAR_ORDER,
    sidebarPlaylistsVisible: true,
  });
}

/**
 * settings · SidebarPreview. A scaled-down mock of the real app sidebar shown in
 * the Sidebar settings section. It reads the live `useUIStore` order / hidden /
 * playlists state and renders the visible nav items into a labelled
 * `role="img"` block (named by the "Preview" caption), spotlighting the hovered
 * row. Presentational over store state — no IPC. Stories assert the labelled
 * mock and its visible nav rows.
 */
const meta: Meta<typeof SidebarPreview> = {
  title: 'settings/SidebarPreview',
  component: SidebarPreview,
  parameters: {
    // The mock is a single role="img" with an accessible name from the caption;
    // its decorative skeleton bars carry no roles — axe clean.
    a11y: { test: 'error' },
  },
  beforeEach: resetSidebar,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidebarPreview>;

/** The labelled mock renders the visible sidebar nav items (e.g. Overview). */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The preview surface is exposed as a labelled image.
    await expect(canvas.getByRole('img', { name: 'Preview' })).toBeInTheDocument();
    // The default sidebar order surfaces the Overview nav item in the mock.
    await expect(canvas.getByText('Overview')).toBeInTheDocument();
  },
};
