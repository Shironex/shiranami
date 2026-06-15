import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ScrobbleStatus } from '@shiranami/contracts';

import ScrobbleSection from './ScrobbleSection';

/** Point the story's IPC mock at a concrete status so the providers render. */
function seedStatus(status: ScrobbleStatus): void {
  window.electronAPI.scrobble.getStatus = () => Promise.resolve(status);
}

const meta: Meta<typeof ScrobbleSection> = {
  title: 'settings/ScrobbleSection',
  component: ScrobbleSection,
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

export const Default: Story = {
  decorators: [
    Story => {
      seedStatus({
        enabled: false,
        lastfmConnected: false,
        lastfmUsername: null,
        listenBrainzConnected: false,
        pendingCount: 0,
      });
      return <Story />;
    },
  ],
};

export const Connected: Story = {
  decorators: [
    Story => {
      seedStatus({
        enabled: true,
        lastfmConnected: true,
        lastfmUsername: 'idealism',
        listenBrainzConnected: true,
        pendingCount: 3,
      });
      return <Story />;
    },
  ],
};
