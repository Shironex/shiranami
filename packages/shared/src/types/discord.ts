// Discord Rich Presence types for Shiranami (music context).
//
// Adapted from ShiroAni's anime-oriented presence types. Shiranami exposes a
// now-playing presence with three activity types and template-based status
// text. There is no main-process i18n in Shiranami, so default template fields
// ship as literal English strings (no `@@i18n:` sentinels) — see
// `DEFAULT_DISCORD_TEMPLATES` in `../constants/discord`.

/** Music player presence states. */
export type DiscordMusicActivityType = 'playing' | 'paused' | 'idle';

/**
 * A single status template. `details` is line 1, `state` is line 2. The three
 * toggles control whether the track timer, the app logo, and the landing
 * button appear in the rendered presence.
 */
export interface DiscordPresenceTemplate {
  details: string;
  state: string;
  showTimestamp: boolean;
  showLargeImage: boolean;
  showButton: boolean;
}

/** One template per activity type. */
export type DiscordPresenceTemplates = Record<DiscordMusicActivityType, DiscordPresenceTemplate>;

/** Persisted Discord RPC settings. Single source of truth lives in electron-store. */
export interface DiscordRpcSettings {
  enabled: boolean;
  /** Show the track title/artist lines on Discord. */
  showTrackDetails: boolean;
  /** Show the elapsed/remaining track timer. */
  showElapsedTime: boolean;
  /** When true, the per-activity templates drive the presence text. */
  useCustomTemplates: boolean;
  templates: DiscordPresenceTemplates;
}

/**
 * Now-playing snapshot the presence builder consumes. Mirrors the relevant
 * fields of the main-process `PlaybackState`, kept independent so the builder
 * stays pure and importable from the shared package.
 */
export interface DiscordMusicPresenceActivity {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  /** Total track length in seconds. */
  duration: number;
  /** Current playhead position in seconds. */
  currentTime: number;
}
