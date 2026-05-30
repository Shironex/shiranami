import { z } from 'zod';

// Both recommendation channels take no arguments — the renderer is read-only
// and shelf selection is fixed. Empty tuples so the renderer can invoke with
// zero args and tampered payloads are rejected by the shared validator.
export const recommendationsGetArgs = z.tuple([]);
export const recommendationsRefreshArgs = z.tuple([]);

// "More like this": a single seed track id. Non-empty so tampered/empty
// payloads are rejected before the DB lookup.
export const recommendationsSimilarArgs = z.tuple([z.string().min(1)]);

// Negative signal (mark / undo "Not interested"): a single track id. Non-empty
// so a tampered/empty payload is rejected before the DB write.
export const recommendationsNotInterestedArgs = z.tuple([z.string().min(1)]);
