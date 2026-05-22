import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ipcHandlers } from '../../../test/setup';

const mockService = vi.hoisted(() => ({
  getDiscordRpcSettings: vi.fn(),
  updateDiscordRpcSettings: vi.fn(),
  updateDiscordPresence: vi.fn(),
  clearDiscordPresence: vi.fn(),
}));
vi.mock('../discord-rpc', () => mockService);

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerDiscordRpcHandlers, cleanupDiscordRpcHandlers } from './discord-rpc';

const ACTIVITY = {
  isPlaying: true,
  title: 'Idol',
  artist: 'Yoasobi',
  album: 'THE BOOK 3',
  duration: 222,
  currentTime: 30,
};

describe('discord-rpc ipc handlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    Object.values(mockService).forEach(fn => fn.mockReset());
    registerDiscordRpcHandlers();
  });

  afterEach(() => {
    cleanupDiscordRpcHandlers();
  });

  it('discord-rpc:get-settings delegates to the service', async () => {
    mockService.getDiscordRpcSettings.mockReturnValue({ enabled: true });
    const handler = ipcHandlers.get('discord-rpc:get-settings')!;
    const result = await handler(null);
    expect(mockService.getDiscordRpcSettings).toHaveBeenCalled();
    expect(result).toEqual({ enabled: true });
  });

  it('discord-rpc:update-settings delegates with the patch', async () => {
    const updates = { enabled: false };
    mockService.updateDiscordRpcSettings.mockReturnValue(updates);
    const handler = ipcHandlers.get('discord-rpc:update-settings')!;
    const result = await handler(null, updates);
    expect(mockService.updateDiscordRpcSettings).toHaveBeenCalledWith(updates);
    expect(result).toEqual(updates);
  });

  it('discord-rpc:update-settings rejects a malformed patch', async () => {
    const handler = ipcHandlers.get('discord-rpc:update-settings')!;
    await expect(handler(null, { enabled: 'yes' })).rejects.toBeDefined();
    expect(mockService.updateDiscordRpcSettings).not.toHaveBeenCalled();
  });

  it('discord-rpc:update-presence pads the activity to a PlaybackState', async () => {
    const handler = ipcHandlers.get('discord-rpc:update-presence')!;
    await handler(null, ACTIVITY);
    expect(mockService.updateDiscordPresence).toHaveBeenCalledWith({
      ...ACTIVITY,
      albumArt: null,
    });
  });

  it('discord-rpc:update-presence swallows service errors (fallback)', async () => {
    mockService.updateDiscordPresence.mockImplementation(() => {
      throw new Error('rpc down');
    });
    const handler = ipcHandlers.get('discord-rpc:update-presence')!;
    await expect(handler(null, ACTIVITY)).resolves.toBeUndefined();
  });

  it('discord-rpc:clear-presence delegates', async () => {
    const handler = ipcHandlers.get('discord-rpc:clear-presence')!;
    await handler(null);
    expect(mockService.clearDiscordPresence).toHaveBeenCalled();
  });

  it('cleanupDiscordRpcHandlers removes every discord-rpc handler', () => {
    cleanupDiscordRpcHandlers();
    [
      'discord-rpc:get-settings',
      'discord-rpc:update-settings',
      'discord-rpc:update-presence',
      'discord-rpc:clear-presence',
    ].forEach(ch => {
      expect(ipcHandlers.get(ch)).toBeUndefined();
    });
  });
});
