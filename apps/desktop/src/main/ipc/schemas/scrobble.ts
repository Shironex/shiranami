import { z } from 'zod';

// No-arg reads / disconnects.
export const scrobbleGetStatusArgs = z.tuple([]);
export const scrobbleLastfmBeginAuthArgs = z.tuple([]);
export const scrobbleLastfmDisconnectArgs = z.tuple([]);
export const scrobbleListenBrainzDisconnectArgs = z.tuple([]);

// Master switch toggle.
export const scrobbleSetEnabledArgs = z.tuple([z.boolean()]);

// Last.fm token exchange — the single-use desktop-auth token.
export const scrobbleLastfmCompleteAuthArgs = z.tuple([z.string().min(1)]);

// ListenBrainz user token (a UUID-ish string); non-empty so a blank submit is
// rejected before any network call.
export const scrobbleListenBrainzConnectArgs = z.tuple([z.string().min(1)]);
