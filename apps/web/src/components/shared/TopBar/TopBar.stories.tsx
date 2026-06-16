import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useViewStore } from '@/stores/useViewStore';

import TopBar from './TopBar';

/**
 * shared · TopBar. The draggable window chrome strip: a page title (drawn from
 * the active view, hidden on now-playing), a library-only Add/Rescan dropdown, an
 * optional language segmented control, and the Windows-only WindowControls
 * cluster (which renders nothing in the browser). Reads `useViewStore.activeView`
 * for the title and dropdown gating; stories seed it.
 */
const meta: Meta<typeof TopBar> = {
  title: 'shared/TopBar',
  component: TopBar,
  args: {
    onAddFile: fn(),
    onAddFolder: fn(),
    isScanning: false,
  },
};

export default meta;

type Story = StoryObj<typeof TopBar>;

/** The library view — the Add/Rescan dropdown trigger is offered. */
export const Library: Story = {
  beforeEach: () => {
    useViewStore.setState({ activeView: 'library' });
  },
};

/** The settings view — just the page title and language control. */
export const Settings: Story = {
  beforeEach: () => {
    useViewStore.setState({ activeView: 'settings' });
  },
};
