import type { Meta, StoryObj } from '@storybook/react-vite';

import ShareDialogManager from './ShareDialogManager';

/**
 * shared · ShareDialogManager. The app-root singleton that wires the global
 * share + import dialogs to their event sources: it listens for
 * `open-share-dialog` custom events and for `share.onDeepLink` import codes, then
 * renders ShareDialog / ImportDialog on demand. With no event fired it renders
 * nothing, which is its resting state in the canvas.
 */
const meta: Meta<typeof ShareDialogManager> = {
  title: 'shared/ShareDialogManager',
  component: ShareDialogManager,
};

export default meta;

type Story = StoryObj<typeof ShareDialogManager>;

/** Resting state — no dialog open until a share/import event arrives. */
export const Default: Story = {};
