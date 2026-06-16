import type { Meta, StoryObj } from '@storybook/react-vite';

import TrackEnrichDialogManager from './TrackEnrichDialogManager';

/**
 * shared · TrackEnrichDialogManager. The app-root singleton that wires the global
 * metadata-enrich dialog to its event source: it listens for
 * `open-track-enrich-dialog` custom events (dispatched from the track context
 * menu) and renders TrackEnrichDialog keyed to the requested track. With no event
 * fired it renders nothing, which is its resting state in the canvas.
 */
const meta: Meta<typeof TrackEnrichDialogManager> = {
  title: 'shared/TrackEnrichDialogManager',
  component: TrackEnrichDialogManager,
};

export default meta;

type Story = StoryObj<typeof TrackEnrichDialogManager>;

/** Resting state — no dialog open until an enrich event arrives. */
export const Default: Story = {};
