import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SyncQrCode from './SyncQrCode';

/**
 * settings · SyncQrCode. The pairing QR the "Sync with phone" section shows:
 * an inline SVG on a white plate with a four module quiet zone. The payload
 * here is a sample link with a dummy secret.
 */
const meta: Meta<typeof SyncQrCode> = {
  title: 'settings/SyncQrCode',
  component: SyncQrCode,
  parameters: { a11y: { test: 'error' } },
  args: {
    value:
      'shiranami://pair?v=1&h=192.168.1.20&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    label: 'Pairing code',
  },
};

export default meta;

type Story = StoryObj<typeof SyncQrCode>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Pairing code' })).toBeInTheDocument();
  },
};

/** The compact size the section falls back to on narrow windows. */
export const Small: Story = { args: { size: 128 } };
