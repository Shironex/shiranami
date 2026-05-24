// Shared validation schema for the public POST /api/share body. Used by the
// server (apps/server) to validate inbound requests AND by the desktop main
// process (apps/desktop) to validate the outbound body before issuing the
// HTTP call — so both ends of the wire stay in lockstep.

import { z } from 'zod';

const trackPayloadSchema = z.object({
  title: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  ytId: z.string().min(1).max(20),
});

const playlistPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  tracks: z.array(trackPayloadSchema).min(1).max(500),
});

export const createTrackShareSchema = z.object({
  type: z.literal('TRACK'),
  payload: trackPayloadSchema,
});

export const createPlaylistShareSchema = z.object({
  type: z.literal('PLAYLIST'),
  payload: playlistPayloadSchema,
});

export const createShareSchema = z.discriminatedUnion('type', [
  createTrackShareSchema,
  createPlaylistShareSchema,
]);

// The GET /api/share/:code response: a stored share (type + payload) plus the
// server-assigned code and expiry. Used by the desktop main process to validate
// the inbound response before handing it to the renderer, so a malformed or
// hostile response cannot propagate as a lying type into the import UI. `code`
// and `expiresAt` mirror the server's ShareData (expiresAt is a Date serialized
// to an ISO string over JSON).
const shareMeta = { code: z.string().min(1), expiresAt: z.iso.datetime({ offset: true }) };

export const shareImportResponseSchema = z.discriminatedUnion('type', [
  createTrackShareSchema.extend(shareMeta),
  createPlaylistShareSchema.extend(shareMeta),
]);

export type CreateShareDto = z.infer<typeof createShareSchema>;
export type ShareImportResponse = z.infer<typeof shareImportResponseSchema>;
export type TrackPayload = z.infer<typeof trackPayloadSchema>;
export type PlaylistPayload = z.infer<typeof playlistPayloadSchema>;
