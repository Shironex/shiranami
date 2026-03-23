import { Client } from '@xhayper/discord-rpc';
import { logger } from './logger';
import { store } from './store';
import type { PlaybackState } from './media-controls';

const DISCORD_CLIENT_ID = '1484544721060761610';
const MIN_UPDATE_INTERVAL_MS = 15_000; // Discord rate limit: 1 update per 15s
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
const MAX_FIELD_LENGTH = 128;

let client: Client | null = null;
let isConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let lastUpdateTime = 0;
let pendingState: PlaybackState | null | undefined = undefined;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let connectPromise: Promise<void> | null = null;

function isEnabled(): boolean {
  try {
    const settings = store.get('settings') as Record<string, unknown> | undefined;
    return settings?.discordRpc === true;
  } catch {
    return false;
  }
}

const MIN_FIELD_LENGTH = 2; // Discord requires at least 2 characters

function truncate(text: string, max: number = MAX_FIELD_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

function sanitizeField(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (trimmed.length < MIN_FIELD_LENGTH) return undefined;
  return truncate(trimmed);
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearThrottleTimer(): void {
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  if (!isEnabled()) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectClient();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function buildPresence(state: PlaybackState): Record<string, unknown> {
  const presence: Record<string, unknown> = {
    details: sanitizeField(state.title) ?? 'Unknown Track',
    largeImageKey: 'shiranami',
    largeImageText: sanitizeField(state.album) ?? 'Shiranami',
  };

  const artist = sanitizeField(state.artist);
  if (artist) {
    presence.state = artist;
  }

  // Show time remaining when playing
  if (state.isPlaying && state.duration > 0) {
    const remainingMs = (state.duration - state.currentTime) * 1000;
    presence.endTimestamp = new Date(Date.now() + remainingMs);
  }

  return presence;
}

async function sendPresenceUpdate(state: PlaybackState | null): Promise<void> {
  if (!client || !isConnected) return;

  try {
    if (!state || !state.isPlaying) {
      await client.user?.clearActivity();
    } else {
      const presence = buildPresence(state);
      await client.user?.setActivity(presence as never);
    }
    lastUpdateTime = Date.now();
  } catch (error) {
    logger.error('[discord-rpc] Failed to update presence:', error);
  }
}

function throttledUpdate(state: PlaybackState | null): void {
  const now = Date.now();
  const elapsed = now - lastUpdateTime;

  if (elapsed >= MIN_UPDATE_INTERVAL_MS) {
    sendPresenceUpdate(state).catch(() => {});
    pendingState = undefined;
  } else {
    pendingState = state;
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (pendingState !== undefined) {
          sendPresenceUpdate(pendingState).catch(() => {});
          pendingState = undefined;
        }
      }, MIN_UPDATE_INTERVAL_MS - elapsed);
    }
  }
}

async function doConnect(): Promise<void> {
  if (client) {
    try {
      client.destroy();
    } catch {
      // ignore cleanup errors
    }
    client = null;
    isConnected = false;
  }

  client = new Client({ clientId: DISCORD_CLIENT_ID });

  client.on('ready', () => {
    isConnected = true;
    reconnectDelay = RECONNECT_BASE_MS;
    logger.info('[discord-rpc] Connected');
  });

  client.on('disconnected', () => {
    isConnected = false;
    logger.info('[discord-rpc] Disconnected');
    scheduleReconnect();
  });

  try {
    await client.login();
  } catch {
    logger.debug('[discord-rpc] Discord not available, scheduling reconnect');
    isConnected = false;
    scheduleReconnect();
  }
}

function connectClient(): void {
  if (connectPromise) return;
  connectPromise = doConnect().finally(() => {
    connectPromise = null;
  });
}

async function disconnectClient(): Promise<void> {
  clearReconnectTimer();
  clearThrottleTimer();
  pendingState = undefined;

  if (client) {
    try {
      await client.user?.clearActivity();
    } catch {
      // ignore
    }
    try {
      client.destroy();
    } catch {
      // ignore
    }
    client = null;
    isConnected = false;
  }
}

// ========================================
// Public API
// ========================================

export function initializeDiscordRpc(): void {
  const enabled = isEnabled();
  logger.info(`[discord-rpc] Initialized (enabled: ${enabled})`);

  if (enabled) {
    connectClient();
  }
}

export function updateDiscordPresence(state: PlaybackState | null): void {
  if (!isEnabled()) {
    // If disabled but still connected, disconnect
    if (isConnected) {
      disconnectClient();
    }
    return;
  }

  // If enabled but not connected, initiate connection
  if (!isConnected && !connectPromise && !reconnectTimer) {
    connectClient();
  }

  throttledUpdate(state);
}

export function cleanupDiscordRpc(): void {
  disconnectClient();
  logger.info('[discord-rpc] Cleaned up');
}
