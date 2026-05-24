import { Client } from '@xhayper/discord-rpc';
import {
  DEFAULT_DISCORD_TEMPLATES,
  SHIRANAMI_DISCORD_CLIENT_ID,
  type DiscordRpcSettings,
  type DiscordMusicPresenceActivity,
} from '@shiranami/shared';
import { logger } from './logger';
import { store } from './store';
import type { PlaybackState } from './media-controls';
import { buildPresence } from './discord-presence-builder';

const STORE_KEY = 'discord-rpc-settings';
const MIN_UPDATE_INTERVAL_MS = 15_000; // Discord rate limit: 1 update per 15s
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

const DEFAULT_SETTINGS: DiscordRpcSettings = {
  enabled: false,
  showTrackDetails: true,
  showElapsedTime: true,
  useCustomTemplates: false,
  templates: DEFAULT_DISCORD_TEMPLATES,
};

let client: Client | null = null;
let isConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let lastUpdateTime = 0;
let pendingActivity: DiscordMusicPresenceActivity | null | undefined = undefined;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let connectPromise: Promise<void> | null = null;
let currentActivity: DiscordMusicPresenceActivity | null = null;

/**
 * Read persisted settings, filling any missing field from the defaults so an
 * older or partial blob is always coerced to the full shape.
 *
 * Migration: if no `discord-rpc-settings` key exists yet, seed `enabled` from
 * the legacy `settings.discordRpc` boolean so users who already had Rich
 * Presence on keep it on. This runs once — the very next `saveSettings` writes
 * the dedicated key, which then becomes the single source of truth and the
 * legacy flag is never read again.
 */
function getSettings(): DiscordRpcSettings {
  let stored: Partial<DiscordRpcSettings> | undefined;
  try {
    stored = store.get(STORE_KEY) as Partial<DiscordRpcSettings> | undefined;
  } catch {
    stored = undefined;
  }

  if (!stored) {
    let legacyEnabled = DEFAULT_SETTINGS.enabled;
    try {
      const legacy = store.get('settings') as { discordRpc?: boolean } | undefined;
      if (legacy?.discordRpc === true) legacyEnabled = true;
    } catch {
      // ignore — legacy flag is best-effort
    }
    return {
      ...DEFAULT_SETTINGS,
      enabled: legacyEnabled,
      templates: { ...DEFAULT_DISCORD_TEMPLATES },
    };
  }

  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_SETTINGS.enabled,
    showTrackDetails:
      typeof stored.showTrackDetails === 'boolean'
        ? stored.showTrackDetails
        : DEFAULT_SETTINGS.showTrackDetails,
    showElapsedTime:
      typeof stored.showElapsedTime === 'boolean'
        ? stored.showElapsedTime
        : DEFAULT_SETTINGS.showElapsedTime,
    useCustomTemplates:
      typeof stored.useCustomTemplates === 'boolean'
        ? stored.useCustomTemplates
        : DEFAULT_SETTINGS.useCustomTemplates,
    templates: stored.templates
      ? { ...DEFAULT_DISCORD_TEMPLATES, ...stored.templates }
      : { ...DEFAULT_DISCORD_TEMPLATES },
  };
}

function saveSettings(settings: DiscordRpcSettings): void {
  store.set(STORE_KEY, settings);
}

/** Map the main-process PlaybackState into the builder's snapshot shape. */
function toActivity(state: PlaybackState | null): DiscordMusicPresenceActivity | null {
  if (!state) return null;
  return {
    isPlaying: state.isPlaying,
    title: state.title,
    artist: state.artist,
    album: state.album,
    duration: state.duration,
    currentTime: state.currentTime,
  };
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
  if (!getSettings().enabled) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectClient();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

async function sendPresenceUpdate(activity: DiscordMusicPresenceActivity | null): Promise<void> {
  if (!client || !isConnected) return;

  try {
    if (!activity) {
      await client.user?.clearActivity();
    } else {
      const presence = buildPresence(activity, getSettings());
      await client.user?.setActivity(presence as never);
    }
    lastUpdateTime = Date.now();
  } catch (error) {
    logger.error('[discord-rpc] Failed to update presence:', error);
  }
}

function throttledUpdate(activity: DiscordMusicPresenceActivity | null): void {
  const now = Date.now();
  // Clamp to >= 0 so a backward clock jump (NTP correction, manual system clock
  // change) can never make the window look negative and stall the next update.
  const elapsed = Math.max(0, now - lastUpdateTime);

  if (elapsed >= MIN_UPDATE_INTERVAL_MS) {
    sendPresenceUpdate(activity).catch(() => {});
    pendingActivity = undefined;
  } else {
    pendingActivity = activity;
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (pendingActivity !== undefined) {
          sendPresenceUpdate(pendingActivity).catch(() => {});
          pendingActivity = undefined;
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

  client = new Client({ clientId: SHIRANAMI_DISCORD_CLIENT_ID });

  client.on('ready', () => {
    isConnected = true;
    reconnectDelay = RECONNECT_BASE_MS;
    logger.info('[discord-rpc] Connected');
    // Re-emit the last known activity (or an idle presence) on (re)connect,
    // through the throttle so rapid reconnects cannot trip Discord's rate limit.
    throttledUpdate(currentActivity);
  });

  client.on('disconnected', () => {
    isConnected = false;
    logger.info('[discord-rpc] Disconnected');
    scheduleReconnect();
  });

  try {
    await client.login();
  } catch (err) {
    // Keep the error: "Discord not running" and a real auth/handshake failure
    // (bad client id, protocol error) are otherwise indistinguishable, and at
    // the default info level the failure was completely invisible. Exponential
    // backoff in scheduleReconnect caps the frequency, so warn is not spammy.
    logger.warn('[discord-rpc] login failed, scheduling reconnect:', err);
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
  pendingActivity = undefined;

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
  const settings = getSettings();
  logger.info(`[discord-rpc] Initialized (enabled: ${settings.enabled})`);

  if (settings.enabled) {
    connectClient();
  }
}

export function getDiscordRpcSettings(): DiscordRpcSettings {
  return getSettings();
}

export function updateDiscordRpcSettings(updates: Partial<DiscordRpcSettings>): DiscordRpcSettings {
  const current = getSettings();
  const next: DiscordRpcSettings = {
    enabled: updates.enabled ?? current.enabled,
    showTrackDetails: updates.showTrackDetails ?? current.showTrackDetails,
    showElapsedTime: updates.showElapsedTime ?? current.showElapsedTime,
    useCustomTemplates: updates.useCustomTemplates ?? current.useCustomTemplates,
    templates: updates.templates
      ? { ...current.templates, ...updates.templates }
      : current.templates,
  };
  saveSettings(next);

  if (next.enabled && !isConnected && !connectPromise) {
    reconnectDelay = RECONNECT_BASE_MS;
    connectClient();
  } else if (!next.enabled) {
    disconnectClient();
  } else if (isConnected) {
    // Settings changed while connected, so re-send presence through the
    // throttle to reflect the new template without bypassing the rate limit.
    throttledUpdate(currentActivity);
  }

  logger.info(
    `[discord-rpc] Settings updated: enabled=${next.enabled}, showTrackDetails=${next.showTrackDetails}, showElapsedTime=${next.showElapsedTime}, useCustomTemplates=${next.useCustomTemplates}`
  );
  return next;
}

export function updateDiscordPresence(state: PlaybackState | null): void {
  if (!getSettings().enabled) {
    // Disabled but still connected — tear the connection down.
    if (isConnected) {
      disconnectClient();
    }
    return;
  }

  // Enabled but not yet connected — kick off a connection.
  if (!isConnected && !connectPromise && !reconnectTimer) {
    connectClient();
  }

  currentActivity = toActivity(state);
  throttledUpdate(currentActivity);
}

export function clearDiscordPresence(): void {
  currentActivity = null;
  clearThrottleTimer();
  pendingActivity = undefined;

  if (client && isConnected) {
    try {
      client.user?.clearActivity();
    } catch (error) {
      logger.error('[discord-rpc] Failed to clear presence:', error);
    }
  }
}

export function cleanupDiscordRpc(): void {
  disconnectClient();
  currentActivity = null;
  logger.info('[discord-rpc] Cleaned up');
}
