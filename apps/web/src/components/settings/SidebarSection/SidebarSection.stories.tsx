import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useUIStore } from '@/stores/useUIStore';
import { DEFAULT_SIDEBAR_ORDER } from '@/lib/sidebar-items';

import SidebarSection from './SidebarSection';

/** Reset the sidebar UI state so every row starts visible and ordered. */
function resetSidebar(): void {
  useUIStore.setState({
    sidebarHiddenItems: [],
    sidebarOrder: DEFAULT_SIDEBAR_ORDER,
    sidebarPlaylistsVisible: true,
    landingView: 'overview',
  });
}

/**
 * settings · SidebarSection. The Sidebar settings panel: a live preview, a
 * landing-view select, a drag-sortable list of nav items (each row a drag-handle
 * button + a show/hide Switch named by the item, with "Always shown" /
 * "Experimental" annotations), a "Show playlists" toggle, and a reset. Reads and
 * writes `useUIStore`. Stories reset that store, assert the rows, and toggle an
 * item's visibility against the store.
 */
const meta: Meta<typeof SidebarSection> = {
  title: 'settings/SidebarSection',
  component: SidebarSection,
  parameters: {
    // Card title is a real heading; each row switch is aria-labelledby the item
    // label, each drag handle has an aria-label, and the nested preview is a
    // labelled image — axe clean.
    a11y: { test: 'error' },
  },
  beforeEach: resetSidebar,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidebarSection>;

/** The row list renders, and toggling an item's switch updates the store. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Sidebar' })).toBeInTheDocument();

    // The landing-view select and the playlists toggle render.
    await expect(canvas.getByRole('combobox', { name: 'Open Shiranami to' })).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Show playlists' })).toBeInTheDocument();

    // Each item exposes a reorder handle by its localized label.
    await expect(canvas.getByRole('button', { name: 'Reorder History' })).toBeInTheDocument();

    // The History row's switch starts on (item visible); toggling it hides the
    // item in the store.
    const historySwitch = canvas.getByRole('switch', { name: 'History' });
    await expect(historySwitch).toBeChecked();
    await userEvent.click(historySwitch);
    await waitFor(() => expect(useUIStore.getState().sidebarHiddenItems).toContain('history'));
  },
};
