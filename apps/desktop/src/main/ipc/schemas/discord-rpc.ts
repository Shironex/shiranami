import { z } from 'zod';

/** Mirrors `DiscordPresenceTemplate` from `@shiranami/shared`. */
const discordPresenceTemplateSchema = z.object({
  details: z.string(),
  state: z.string(),
  showTimestamp: z.boolean(),
  showLargeImage: z.boolean(),
  showButton: z.boolean(),
});

/** Mirrors `DiscordMusicActivityType` from `@shiranami/shared`. */
const discordActivityTypeSchema = z.enum(['playing', 'paused', 'idle']);

/**
 * Partial of `DiscordRpcSettings` — the renderer patches individual fields via
 * `discord-rpc:update-settings`, so every key is optional.
 */
const discordRpcSettingsPartialSchema = z
  .object({
    enabled: z.boolean(),
    showTrackDetails: z.boolean(),
    showElapsedTime: z.boolean(),
    useCustomTemplates: z.boolean(),
    templates: z.record(discordActivityTypeSchema, discordPresenceTemplateSchema),
  })
  .partial();

/** Mirrors the now-playing snapshot a forced presence refresh carries. */
const discordPresenceActivitySchema = z.object({
  isPlaying: z.boolean(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number(),
  currentTime: z.number(),
});

export const discordGetSettingsArgs = z.tuple([]);
export const discordUpdateSettingsArgs = z.tuple([discordRpcSettingsPartialSchema]);
export const discordUpdatePresenceArgs = z.tuple([discordPresenceActivitySchema]);
export const discordClearPresenceArgs = z.tuple([]);
