import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import PhoneSyncSection from './PhoneSyncSection';

/**
 * settings · PhoneSyncSection. LAN sync v0 on the desktop side: the listener
 * toggle, the pairing QR with a countdown, Allow / Deny for a phone that
 * scanned it, the listening address with live transfers, and the paired
 * phones with revoke.
 *
 * The Storybook preview installs the shared electronAPI mock, which has no
 * optional `sync` namespace (it is v2-only and feature-detected), so the
 * browser run shows the honest "desktop app only" state. The live states are
 * covered by PhoneSyncSection.test.tsx against a mocked `sync` API.
 */
const meta: Meta<typeof PhoneSyncSection> = {
  title: 'settings/PhoneSyncSection',
  component: PhoneSyncSection,
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PhoneSyncSection>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Sync with phone' })).toBeInTheDocument();
  },
};
