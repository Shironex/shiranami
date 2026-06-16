import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import ScrobbleSection from './ScrobbleSection';

/**
 * settings · ScrobbleSection. The opt-in scrobbling panel: a master enable
 * switch, then Last.fm (browser-auth handshake) and ListenBrainz (user-token)
 * provider rows, each with a Connected / Not connected status pill and a
 * connect/disconnect action. The raw session key + token never leave the main
 * process — this UI only sees the status booleans + display name.
 *
 * Status is read on mount via `scrobble.getStatus()`, but that read is gated on
 * `IS_ELECTRON`. In the Storybook browser run `IS_ELECTRON` resolves to `false`
 * — `@/lib/platform` captures it as a module-constant before the preview installs
 * the electronAPI mock — so the read is skipped and `status` stays the hook's
 * `EMPTY_STATUS` (everything disconnected, pendingCount 0). The connected state
 * is therefore unreachable in-browser (no IPC seed can flip the false
 * module-constant), so the stories assert the real not-connected chrome.
 */
const meta: Meta<typeof ScrobbleSection> = {
  title: 'settings/ScrobbleSection',
  component: ScrobbleSection,
  parameters: {
    // Card title is a real heading, the master switch is labelled by its row,
    // the LB token input carries an aria-label, and external links have
    // rel=noopener — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ScrobbleSection>;

/** Nothing connected — both providers show "Not connected" and a Connect path. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Scrobbling' })).toBeInTheDocument();
    // Master switch reflects the empty (disabled) status from EMPTY_STATUS.
    await expect(canvas.getByRole('switch', { name: 'Enable scrobbling' })).not.toBeChecked();
    // Both providers report not-connected.
    await expect(canvas.getAllByText('Not connected')).toHaveLength(2);
    // The ListenBrainz token field (a password input, so no textbox role) is
    // exposed by its aria-label.
    await expect(canvas.getByLabelText('ListenBrainz user token')).toBeInTheDocument();
  },
};

/**
 * Not-connected provider rows — the Connect actions are present. The connected
 * state (status pills flipped, Disconnect buttons, "Connected as <name>") is
 * unreachable in-browser because the on-mount status read is IS_ELECTRON-gated
 * (false here, see meta), so this story asserts the connect-path chrome instead.
 */
export const NotConnected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Both providers expose a "Connect" action (Last.fm browser auth + the
    // ListenBrainz token submit).
    await expect(canvas.getAllByRole('button', { name: 'Connect' })).toHaveLength(2);

    // The connected-only "Connected as ..." line and Disconnect actions never
    // render in the disconnected EMPTY_STATUS state.
    await expect(canvas.queryByText('Connected as idealism')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  },
};
