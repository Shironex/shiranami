import { z } from 'zod';

// Both recommendation channels take no arguments — the renderer is read-only
// and shelf selection is fixed. Empty tuples so the renderer can invoke with
// zero args and tampered payloads are rejected by the shared validator.
export const recommendationsGetArgs = z.tuple([]);
export const recommendationsRefreshArgs = z.tuple([]);
