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

// Smart mixes: contextual signals from the renderer. `hour` is the local hour
// (0–23); `weather` is the optional opted-in condition bucket. Unknown weather
// strings are coerced to 'unknown' so a tampered payload degrades gracefully
// instead of throwing.
const smartMixWeather = z
  .enum([
    'clear',
    'partly_cloudy',
    'cloudy',
    'rain',
    'snow',
    'thunderstorm',
    'fog',
    'unknown',
  ])
  // `.catch` coerces any non-matching value to 'unknown' instead of throwing, so a
  // tampered/stale weather string degrades gracefully rather than rejecting the call.
  .catch('unknown');
export const recommendationsSmartMixesArgs = z.tuple([
  z.object({
    hour: z.number().int().min(0).max(23),
    weather: smartMixWeather.optional(),
  }),
]);
