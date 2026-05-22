import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';

// --- Mock electron-store ---
const storeData = new Map<string, unknown>();
vi.mock('./store', () => ({
  store: {
    get: vi.fn((key: string) => storeData.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      storeData.set(key, value);
    }),
  },
}));

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// --- Mock the xhayper RPC client ---
type Listener = () => void;

const { MockClient } = vi.hoisted(() => {
  class MockClient {
    static instances: MockClient[] = [];
    clientId: string;
    listeners = new Map<string, Listener>();
    user = { setActivity: vi.fn().mockResolvedValue(undefined), clearActivity: vi.fn() };
    login = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();

    constructor({ clientId }: { clientId: string }) {
      this.clientId = clientId;
      MockClient.instances.push(this);
    }
    on(event: string, fn: Listener) {
      this.listeners.set(event, fn);
    }
    /** Simulate Discord signalling the socket is ready. */
    fireReady() {
      this.listeners.get('ready')?.();
    }
  }
  return { MockClient };
});

vi.mock('@xhayper/discord-rpc', () => ({
  Client: MockClient,
}));

// Import after mocks are registered.
import {
  getDiscordRpcSettings,
  updateDiscordRpcSettings,
  updateDiscordPresence,
  clearDiscordPresence,
  initializeDiscordRpc,
  cleanupDiscordRpc,
} from './discord-rpc';

const PLAYING = {
  isPlaying: true,
  title: 'Idol',
  artist: 'Yoasobi',
  album: 'THE BOOK 3',
  duration: 222,
  currentTime: 30,
  albumArt: null,
};

beforeEach(() => {
  storeData.clear();
  MockClient.instances = [];
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanupDiscordRpc();
  vi.useRealTimers();
});

describe('getDiscordRpcSettings', () => {
  it('returns defaults when nothing is stored', () => {
    const settings = getDiscordRpcSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.showTrackDetails).toBe(true);
    expect(settings.showElapsedTime).toBe(true);
    expect(settings.useCustomTemplates).toBe(false);
    expect(settings.templates).toEqual(DEFAULT_DISCORD_TEMPLATES);
  });

  it('coerces a partial stored blob to the full shape', () => {
    storeData.set('discord-rpc-settings', { enabled: true });
    const settings = getDiscordRpcSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.showTrackDetails).toBe(true);
    expect(settings.templates).toEqual(DEFAULT_DISCORD_TEMPLATES);
  });

  it('migrates the legacy settings.discordRpc=true flag when no dedicated key exists', () => {
    storeData.set('settings', { discordRpc: true });
    const settings = getDiscordRpcSettings();
    expect(settings.enabled).toBe(true);
  });

  it('ignores the legacy flag once the dedicated key exists', () => {
    storeData.set('settings', { discordRpc: true });
    storeData.set('discord-rpc-settings', { enabled: false });
    expect(getDiscordRpcSettings().enabled).toBe(false);
  });
});

describe('updateDiscordRpcSettings', () => {
  it('persists the merged settings under the dedicated key', () => {
    const next = updateDiscordRpcSettings({ enabled: true, showElapsedTime: false });
    expect(next.enabled).toBe(true);
    expect(next.showElapsedTime).toBe(false);
    expect(storeData.get('discord-rpc-settings')).toMatchObject({
      enabled: true,
      showElapsedTime: false,
    });
  });

  it('connects a client when enabling', () => {
    updateDiscordRpcSettings({ enabled: true });
    expect(MockClient.instances).toHaveLength(1);
    expect(MockClient.instances[0].login).toHaveBeenCalled();
  });

  it('destroys the client when disabling after being connected', async () => {
    updateDiscordRpcSettings({ enabled: true });
    const client = MockClient.instances[0];
    await Promise.resolve();
    client.fireReady();

    updateDiscordRpcSettings({ enabled: false });
    await Promise.resolve();
    expect(client.destroy).toHaveBeenCalled();
  });

  it('does not open a second client when toggled on while already connecting', () => {
    updateDiscordRpcSettings({ enabled: true });
    updateDiscordRpcSettings({ enabled: true, showTrackDetails: false });
    expect(MockClient.instances).toHaveLength(1);
  });

  it('merges per-activity template patches over the current templates', () => {
    const next = updateDiscordRpcSettings({
      templates: { playing: { ...DEFAULT_DISCORD_TEMPLATES.playing, details: 'Vibing' } },
    });
    expect(next.templates.playing.details).toBe('Vibing');
    expect(next.templates.paused).toEqual(DEFAULT_DISCORD_TEMPLATES.paused);
  });
});

describe('updateDiscordPresence', () => {
  it('does nothing and opens no client when disabled', () => {
    updateDiscordPresence(PLAYING);
    expect(MockClient.instances).toHaveLength(0);
  });

  it('sends the presence after connecting when enabled', async () => {
    updateDiscordRpcSettings({ enabled: true });
    const client = MockClient.instances[0];
    await Promise.resolve();
    client.fireReady();

    // The on-ready handler consumes the throttle window (it emits an initial
    // idle/clear), so advance past it to flush the deferred presence.
    updateDiscordPresence(PLAYING);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(client.user.setActivity).toHaveBeenCalled();
    const payload = client.user.setActivity.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload.details).toBe('Listening to music');
    expect(payload.state).toBe('Idol by Yoasobi');
  });

  it('coalesces rapid updates within the 15s window into one deferred send', async () => {
    updateDiscordRpcSettings({ enabled: true });
    const client = MockClient.instances[0];
    await Promise.resolve();
    // The on-ready emit consumes the throttle window, so the next updates fall
    // inside it and must be deferred rather than sent immediately. Flush its
    // async send so `lastUpdateTime` is set before we measure the window.
    client.fireReady();
    await vi.advanceTimersByTimeAsync(0);
    client.user.setActivity.mockClear();

    updateDiscordPresence(PLAYING);
    updateDiscordPresence({ ...PLAYING, title: 'Racing Into The Night' });
    await Promise.resolve();
    expect(client.user.setActivity).not.toHaveBeenCalled(); // both deferred

    await vi.advanceTimersByTimeAsync(15_000);
    expect(client.user.setActivity).toHaveBeenCalledTimes(1); // coalesced into one
    const payload = client.user.setActivity.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.state).toBe('Racing Into The Night by Yoasobi'); // the latest activity won
  });
});

describe('clearDiscordPresence', () => {
  it('clears the activity on the connected client', async () => {
    updateDiscordRpcSettings({ enabled: true });
    const client = MockClient.instances[0];
    await Promise.resolve();
    client.fireReady();

    clearDiscordPresence();
    expect(client.user.clearActivity).toHaveBeenCalled();
  });
});

describe('initializeDiscordRpc', () => {
  it('connects on startup when persisted settings are enabled', () => {
    storeData.set('discord-rpc-settings', { enabled: true });
    initializeDiscordRpc();
    expect(MockClient.instances).toHaveLength(1);
  });

  it('does not connect on startup when disabled', () => {
    storeData.set('discord-rpc-settings', { enabled: false });
    initializeDiscordRpc();
    expect(MockClient.instances).toHaveLength(0);
  });
});
