import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncApi } from '@shiranami/contracts';
import type { SyncDevice, SyncStatus } from '@shiranami/contracts/bindings';

import PhoneSyncSection from './PhoneSyncSection';
import { DEVICE_REFRESH_MS, formatCountdown } from './PhoneSyncSection.hooks';

const OFF: SyncStatus = {
  running: false,
  addresses: [],
  advertising: false,
  pairing: null,
  pendingPairs: [],
  transfers: [],
};

const ON: SyncStatus = {
  ...OFF,
  running: true,
  addresses: ['192.168.1.20:53111'],
  advertising: true,
};

const LINK =
  'shiranami://pair?v=1&h=192.168.1.20&p=53111&id=desk-1&n=Studio&t=n1&k=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

const PIXEL: SyncDevice = {
  deviceId: 'dev-1',
  name: 'Pixel 9',
  platform: 'android',
  createdAt: '2026-11-08T10:00:00.000Z',
  lastSeenAt: null,
};

let pushStatus: (status: SyncStatus) => void = () => undefined;

function mockApi(initial: SyncStatus, devices: SyncDevice[] = []) {
  const api = {
    getStatus: vi.fn<SyncApi['getStatus']>().mockResolvedValue(initial),
    setEnabled: vi
      .fn<SyncApi['setEnabled']>()
      .mockImplementation(async enabled => (enabled ? ON : OFF)),
    startPairing: vi.fn<SyncApi['startPairing']>().mockResolvedValue({
      deepLink: LINK,
      hosts: ['192.168.1.20'],
      port: 53111,
      expiresAt: Date.now() + 300_000,
    }),
    cancelPairing: vi.fn<SyncApi['cancelPairing']>().mockResolvedValue(ON),
    respondPairing: vi.fn<SyncApi['respondPairing']>().mockResolvedValue(true),
    listDevices: vi.fn<SyncApi['listDevices']>().mockResolvedValue(devices),
    revokeDevice: vi.fn<SyncApi['revokeDevice']>().mockResolvedValue([]),
    onStatus: vi.fn<SyncApi['onStatus']>().mockImplementation(callback => {
      pushStatus = callback;
      return () => undefined;
    }),
  } satisfies SyncApi;
  window.electronAPI.sync = api;
  return api;
}

afterEach(() => {
  delete window.electronAPI.sync;
  pushStatus = () => undefined;
});

describe('PhoneSyncSection', () => {
  beforeEach(() => {
    mockApi(OFF);
  });

  it('starts the listener from the toggle and shows where it listens', async () => {
    const user = userEvent.setup();
    const api = mockApi(OFF);
    render(<PhoneSyncSection />);

    const toggle = await screen.findByRole('switch', { name: 'Allow phones on this network' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(api.setEnabled).toHaveBeenCalledWith(true);
    expect(await screen.findByText('Listening on 192.168.1.20:53111')).toBeInTheDocument();
    expect(screen.getByText('Phones on this network can find this computer.')).toBeInTheDocument();
  });

  it('shows the reason when the listener cannot start', async () => {
    const user = userEvent.setup();
    const api = mockApi(OFF);
    api.setEnabled.mockRejectedValueOnce(new Error('no private network interface'));
    render(<PhoneSyncSection />);

    await user.click(await screen.findByRole('switch', { name: 'Allow phones on this network' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no private network interface');
  });

  it('draws the pairing QR without printing the secret', async () => {
    const user = userEvent.setup();
    const api = mockApi(ON);
    const ticket = await api.startPairing();
    api.getStatus.mockResolvedValue({ ...ON, pairing: ticket });
    render(<PhoneSyncSection />);

    await user.click(await screen.findByRole('button', { name: 'Pair a phone' }));

    expect(await screen.findByRole('img', { name: 'Pairing code' })).toBeInTheDocument();
    expect(screen.getByText(/Code expires in 4:5\d|Code expires in 5:00/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('AAECAw');
  });

  it('asks before a scanned phone gets anything, and allows it', async () => {
    const user = userEvent.setup();
    const api = mockApi(ON);
    render(<PhoneSyncSection />);
    await screen.findByText('Listening on 192.168.1.20:53111');

    act(() =>
      pushStatus({
        ...ON,
        pendingPairs: [{ requestId: 'req-1', deviceName: 'Pixel 9', platform: 'android' }],
      })
    );
    const request = (await screen.findByText('A phone wants to pair')).closest('li');
    expect(request).not.toBeNull();
    expect(within(request as HTMLElement).getByText('Pixel 9 · android')).toBeInTheDocument();

    await user.click(within(request as HTMLElement).getByRole('button', { name: 'Allow' }));
    expect(api.respondPairing).toHaveBeenCalledWith('req-1', true);
  });

  it('lists paired phones and revokes one', async () => {
    const user = userEvent.setup();
    const api = mockApi(OFF, [PIXEL]);
    render(<PhoneSyncSection />);

    expect(await screen.findByText('Pixel 9')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke Pixel 9' }));

    expect(api.revokeDevice).toHaveBeenCalledWith('dev-1');
    expect(await screen.findByText('No phones paired yet.')).toBeInTheDocument();
  });

  it('shows active transfers from a pushed status', async () => {
    mockApi(ON);
    render(<PhoneSyncSection />);
    await screen.findByText('Listening on 192.168.1.20:53111');

    act(() =>
      pushStatus({
        ...ON,
        transfers: [{ deviceId: 'dev-1', deviceName: 'Pixel 9', trackId: 't1', title: 'Yoru' }],
      })
    );

    expect(await screen.findByText('Sending Yoru to Pixel 9')).toBeInTheDocument();
  });

  it('re-reads the paired phones once for a burst of pushes', async () => {
    const api = mockApi(ON);
    render(<PhoneSyncSection />);
    await screen.findByText('Listening on 192.168.1.20:53111');
    expect(api.listDevices).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    try {
      const transfer = { deviceId: 'dev-1', deviceName: 'Pixel 9', trackId: 't1', title: 'Yoru' };
      // A transfer starting and ending, then another starting.
      act(() => pushStatus({ ...ON, transfers: [transfer] }));
      act(() => pushStatus(ON));
      act(() => pushStatus({ ...ON, transfers: [transfer] }));
      expect(api.listDevices).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEVICE_REFRESH_MS);
      });
      expect(api.listDevices).toHaveBeenCalledTimes(2);

      act(() => pushStatus(ON));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEVICE_REFRESH_MS);
      });
      expect(api.listDevices).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains itself where the desktop bridge has no sync', () => {
    delete window.electronAPI.sync;
    render(<PhoneSyncSection />);

    expect(
      screen.getByText('Phone sync is available in the Shiranami desktop app.')
    ).toBeInTheDocument();
  });
});

describe('formatCountdown', () => {
  it('rounds up to whole seconds and never goes negative', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(64_001)).toBe('1:05');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
