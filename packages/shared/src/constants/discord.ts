import type { DiscordMusicActivityType, DiscordPresenceTemplates } from '../types/discord';

/**
 * Shiranami's registered Discord application client ID. Presence only renders
 * for a Discord application that exists at
 * https://discord.com/developers/applications. The large-image asset key
 * `DISCORD_LARGE_IMAGE_KEY` below must be uploaded as a Rich Presence art
 * asset for THIS application or the logo slot renders blank.
 */
export const SHIRANAMI_DISCORD_CLIENT_ID = '1484544721060761610';

/**
 * Rich Presence art asset key. This is NOT a URL — it must match the name of
 * an uploaded art asset in the Discord Developer Portal for application
 * `SHIRANAMI_DISCORD_CLIENT_ID`. Shiranami's local album art uses the
 * `shiranami-art://` protocol which is not externally reachable, so the static
 * app logo is used for every presence state.
 */
export const DISCORD_LARGE_IMAGE_KEY = 'shiranami';

/** Landing-page button shown on the presence card. */
export const DISCORD_LANDING_URL = 'https://shiranami.app';

/** Discord rich-presence string fields must be at most 128 characters. */
export const DISCORD_MAX_FIELD_LENGTH = 128;

export const DISCORD_ACTIVITY_TYPES: DiscordMusicActivityType[] = ['playing', 'paused', 'idle'];

/**
 * Template tokens available to users, with i18n key suffixes for their
 * descriptions. The renderer resolves the descriptions via
 * `settings:discord.templateVariable.<suffix>`.
 */
export const DISCORD_TEMPLATE_VARIABLES = [
  { key: '{title}', descriptionKey: 'discord.templateVariable.title' },
  { key: '{artist}', descriptionKey: 'discord.templateVariable.artist' },
  { key: '{album}', descriptionKey: 'discord.templateVariable.album' },
] as const;

/**
 * Default per-activity templates. Shiranami has no main-process i18n, so the
 * `details` fields are literal English strings (not `@@i18n:` sentinels). The
 * renderer presents these defaults verbatim and persists them as-is; resetting
 * a template restores these literals. UI-language localization of the editor
 * chrome (labels, placeholders) still happens via the `settings` namespace.
 */
export const DEFAULT_DISCORD_TEMPLATES: DiscordPresenceTemplates = {
  playing: {
    details: 'Listening to music',
    state: '{title} by {artist}',
    showTimestamp: true,
    showLargeImage: true,
    showButton: true,
  },
  paused: {
    details: 'Music paused',
    state: '{title} by {artist}',
    showTimestamp: false,
    showLargeImage: true,
    showButton: false,
  },
  idle: {
    details: 'Idle',
    state: '',
    showTimestamp: false,
    showLargeImage: true,
    showButton: false,
  },
};
