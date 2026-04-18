import { z } from 'zod';

/**
 * Mirrors the `PlaybackState` shape from `../media-controls`. Renderer-driven
 * payload; kept loose because nothing in the main process depends on the
 * values beyond passing them to the tray/discord-rpc integrations.
 */
const playbackStateSchema = z.object({
  isPlaying: z.boolean(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number(),
  currentTime: z.number(),
  albumArt: z.string().nullable(),
});

export const mediaPlaybackStateArgs = z.tuple([playbackStateSchema]);
export const mediaClearStateArgs = z.tuple([]);
