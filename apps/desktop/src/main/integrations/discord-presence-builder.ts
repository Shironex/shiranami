// Pure presence-building logic for Discord Rich Presence. Kept free of the
// xhayper client and electron-store so it stays trivially unit-testable: given
// a now-playing snapshot and the user's settings, it returns the plain RPC
// activity object the service hands to `client.user.setActivity`.

import type {
  DiscordRpcSettings,
  DiscordMusicActivityType,
  DiscordMusicPresenceActivity,
  DiscordPresenceTemplate,
} from '@shiranami/shared';
import {
  DEFAULT_DISCORD_TEMPLATES,
  DISCORD_LANDING_URL,
  DISCORD_LARGE_IMAGE_KEY,
  DISCORD_MAX_FIELD_LENGTH,
} from '@shiranami/shared';

const MIN_FIELD_LENGTH = 2; // Discord requires string fields to be >= 2 chars.

function truncate(text: string): string {
  if (text.length <= DISCORD_MAX_FIELD_LENGTH) return text;
  return text.slice(0, DISCORD_MAX_FIELD_LENGTH - 1) + '…';
}

/** Determine the activity type for a now-playing snapshot (null = idle). */
export function resolveActivityType(
  activity: DiscordMusicPresenceActivity | null
): DiscordMusicActivityType {
  if (!activity || !activity.title) return 'idle';
  return activity.isPlaying ? 'playing' : 'paused';
}

/** Replace `{title}`/`{artist}`/`{album}` tokens and clean up empty fragments. */
function substituteVariables(
  template: string,
  activity: DiscordMusicPresenceActivity | null
): string {
  if (!template) return '';

  let result = template
    .replace(/\{title\}/g, activity?.title ?? '')
    .replace(/\{artist\}/g, activity?.artist ?? '')
    .replace(/\{album\}/g, activity?.album ?? '');

  // Collapse double spaces left by empty substitutions, then trim.
  result = result.replace(/\s{2,}/g, ' ').trim();

  return truncate(result);
}

/**
 * Build the Discord presence payload for the given now-playing snapshot.
 *
 * The large image always uses the static `DISCORD_LARGE_IMAGE_KEY` asset —
 * Shiranami's local album art lives behind the `shiranami-art://` protocol and
 * is not reachable by Discord, so the app logo stands in. That asset must be
 * uploaded as a Rich Presence art asset for the registered Discord app, or the
 * logo slot renders blank.
 */
export function buildPresence(
  activity: DiscordMusicPresenceActivity | null,
  settings: DiscordRpcSettings
): Record<string, unknown> {
  const activityType = resolveActivityType(activity);
  const template: DiscordPresenceTemplate = settings.useCustomTemplates
    ? (settings.templates?.[activityType] ?? DEFAULT_DISCORD_TEMPLATES[activityType])
    : DEFAULT_DISCORD_TEMPLATES[activityType];

  const showTrackText = settings.useCustomTemplates || settings.showTrackDetails;
  const showTimestamp =
    (settings.useCustomTemplates ? template.showTimestamp : settings.showElapsedTime) &&
    template.showTimestamp;

  const details = substituteVariables(template.details, activity);
  const state = showTrackText ? substituteVariables(template.state, activity) : '';

  const presence: Record<string, unknown> = {};

  if (details.length >= MIN_FIELD_LENGTH) presence.details = details;
  if (state.length >= MIN_FIELD_LENGTH) presence.state = state;

  if (template.showLargeImage) {
    presence.largeImageKey = DISCORD_LARGE_IMAGE_KEY;
    const albumText = activity?.album?.trim();
    presence.largeImageText =
      albumText && albumText.length >= MIN_FIELD_LENGTH ? albumText : 'Shiranami';
  }

  // Show remaining time only while a track is actually playing with a known
  // duration — a frozen/elapsed bar on a paused track reads as a bug.
  if (
    showTimestamp &&
    activityType === 'playing' &&
    activity &&
    activity.duration > 0 &&
    activity.currentTime >= 0
  ) {
    const remainingMs = Math.max(0, (activity.duration - activity.currentTime) * 1000);
    presence.endTimestamp = new Date(Date.now() + remainingMs);
  }

  if (template.showButton) {
    presence.buttons = [{ label: 'Get Shiranami', url: DISCORD_LANDING_URL }];
  }

  return presence;
}
