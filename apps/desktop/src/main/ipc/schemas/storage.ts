import { z } from 'zod';

/**
 * `storage:get-usage` — the watched library-folder paths. Empty strings are
 * rejected at the boundary; the handler additionally dedupes and tolerates an
 * empty array (returns no volumes).
 */
export const getUsageArgs = z.tuple([z.array(z.string().min(1))]);
