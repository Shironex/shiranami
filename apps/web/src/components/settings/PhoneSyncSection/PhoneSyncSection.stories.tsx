import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { SyncApi } from '@shiranami/contracts';
import type { SyncDevice, SyncStatus } from '@shiranami/contracts/bindings';

import PhoneSyncSection from './PhoneSyncSection';

const STOPPED: SyncStatus = {
  running: false,
  addresses: [],
  advertising: false,
  pairing: null,
  pendingPairs: [],
  transfers: [],
};

const RUNNING: SyncStatus = {
  ...STOPPED,
  running: true,
  addresses: ['192.168.1.20:53111'],
  advertising: true,
};

const PIXEL: SyncDevice = {
  deviceId: 'dev-1',
  name: 'Pixel 9',
  platform: 'android',
  createdAt: '2026-11-08T10:00:00.000Z',
  lastSeenAt: null,
};

/** A `sync` bridge that answers with fixed data and never pushes. */
function fakeSync(status: SyncStatus, devices: SyncDevice[]): SyncApi {
  return {
    getStatus: async () => status,
    setEnabled: async enabled => (enabled ? RUNNING : STOPPED),
    startPairing: () => Promise.reject(new Error('pairing is not available in Storybook')),
    cancelPairing: async () => status,
    respondPairing: async () => false,
    listDevices: async () => devices,
    revokeDevice: async () => devices,
    onStatus: () => () => undefined,
  };
}

/**
 * Put `sync` on the preview's electronAPI mock for one story. That mock is a
 * catch-all Proxy, so without this `sync.getStatus()` would resolve
 * `undefined` instead of a status.
 */
function withSync(status: SyncStatus, devices: SyncDevice[] = []) {
  return () => {
    const original = window.electronAPI;
    const sync = fakeSync(status, devices);
    window.electronAPI = new Proxy(original, {
      get: (target, prop, receiver) =>
        prop === 'sync' ? sync : Reflect.get(target, prop, receiver),
    });
    return () => {
      window.electronAPI = original;
    };
  };
}

/**
 * settings · PhoneSyncSection. LAN sync v0 on the desktop side: the listener
 * toggle, the pairing QR with a countdown, Allow / Deny for a phone that
 * scanned it, the listening address with live transfers, and the paired
 * phones with revoke. Each story installs a fixed `sync` bridge; the
 * interactive flows are covered by PhoneSyncSection.test.tsx.
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
  beforeEach: withSync(STOPPED),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Sync with phone' })).toBeInTheDocument();
  },
};

export const RunningWithAPairedPhone: Story = {
  beforeEach: withSync(RUNNING, [PIXEL]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Pixel 9')).toBeInTheDocument();
  },
};
