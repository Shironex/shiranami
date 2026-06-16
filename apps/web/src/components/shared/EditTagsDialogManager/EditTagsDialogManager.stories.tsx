import type { Meta, StoryObj } from '@storybook/react-vite';

import EditTagsDialogManager from './EditTagsDialogManager';

/**
 * shared · EditTagsDialogManager. The app-root singleton that wires the global
 * edit-tags dialog to its event source: it listens for `open-edit-tags-dialog`
 * custom events (dispatched from the track context menu) and renders
 * EditTagsDialog keyed to the requested track. With no event fired it renders
 * nothing, which is its resting state in the canvas.
 */
const meta: Meta<typeof EditTagsDialogManager> = {
  title: 'shared/EditTagsDialogManager',
  component: EditTagsDialogManager,
};

export default meta;

type Story = StoryObj<typeof EditTagsDialogManager>;

/** Resting state — no dialog open until an edit-tags event arrives. */
export const Default: Story = {};
