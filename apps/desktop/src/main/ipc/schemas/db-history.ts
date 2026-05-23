import { z } from 'zod';

const uuid = z.string().uuid();

/**
 * Record-play payload. `trackId` is a UUID (all track ids go through
 * `crypto.randomUUID`). `duration` may legitimately be null (row column is
 * `real` with no notNull) but the renderer always sends the key, so
 * `.nullable()` — not `.nullish()` — matches the handler signature.
 * `source` defaults to 'library' in the handler.
 */
export const recordPlayInput = z.object({
  trackId: uuid,
  playedSeconds: z.number(),
  duration: z.number().nullable(),
  source: z.string().optional(),
});

const sinceInput = z.object({
  since: z.string().nullable().optional(),
});

// Summary additionally accepts an optional upper bound so callers can request a
// prior window (e.g. the week-over-week trend's preceding 7 days). `until` is
// additive and optional — existing callers that pass only `since` are unaffected.
const summaryInput = z.object({
  since: z.string().nullable().optional(),
  until: z.string().nullable().optional(),
});

const getRecentInput = z.object({
  limit: z.number().int().optional(),
  since: z.string().nullable().optional(),
});

// History channels accept an optional options object — use `.optional()` on
// the tuple element so the renderer can invoke with zero args.
export const historyRecordPlayArgs = z.tuple([recordPlayInput]);
export const historyGetRecentArgs = z.tuple([getRecentInput.optional()]);
export const historyGetSummaryArgs = z.tuple([summaryInput.optional()]);
export const historyGetActivityArgs = z.tuple([sinceInput.optional()]);
export const historyGetHourlyActivityArgs = z.tuple([sinceInput.optional()]);
export const historyGetWeeklyInsightsArgs = z.tuple([sinceInput.optional()]);
