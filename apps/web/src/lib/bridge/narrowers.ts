/**
 * One zod narrower per event channel — §2.6's "trusted structurally, not blindly".
 *
 * Every narrower **validates and returns the original payload**, never zod's
 * parsed output. `z.object` strips unknown keys, and stripping is a silent
 * behaviour change: a field the Rust side adds would vanish before the renderer
 * saw it, and the shim would look correct while quietly narrowing the wire. So
 * the schema is used as a predicate and the value passes through untouched, byte
 * for byte, which is what "argument/return shapes byte-compatible" requires.
 *
 * Schemas assert the fields the renderer actually reads and no more. A narrower
 * stricter than its consumer converts an unused optional field's absence into a
 * dropped event, which is a feature going dark rather than a bug being caught.
 */

import { z } from 'zod';
import { DROP } from './events';

/**
 * Turn a schema into a narrower that returns the original value.
 *
 * Generic in its result because the two guarantees come from different places
 * and neither can supply the other: the schema is the **runtime** guarantee (the
 * payload really has these fields), while the **compile-time** type comes from
 * the namespace interface the subscribing method implements — `onNotice` is
 * declared to hand its callback a `SystemNotice`, so that is what pins `T`.
 */
function predicate(schema: z.ZodType) {
  return <T>(payload: unknown): T | typeof DROP =>
    schema.safeParse(payload).success ? (payload as T) : DROP;
}

// ── primitives ────────────────────────────────────────────────────────────

/** `window:maximized-change`. */
export const maximizedChange = predicate(z.boolean());

/** `media:command` and `share:deep-link` — both a bare string in v1 and v2. */
export const bareString = predicate(z.string());

/**
 * `updater:checking-for-update` and `updater:update-not-available`.
 *
 * v1 sent no payload and the renderer's callbacks take no argument; the Rust
 * newtype is over `()`, which serialises to `null`. Accepting both keeps the
 * narrower honest about what can actually arrive without letting a stray object
 * through as a no-payload signal.
 */
export const noPayload = predicate(z.union([z.null(), z.undefined()]));

// ── progress channels ─────────────────────────────────────────────────────

const progressBase = {
  current: z.number(),
  total: z.number(),
  trackName: z.string(),
};

/** `library:scan-progress`. */
export const scanProgress = predicate(
  z.object({
    filePath: z.string(),
    fileIndex: z.number(),
    fileCount: z.number(),
    ok: z.boolean(),
  })
);

/** `loudness:progress`. */
export const loudnessProgress = predicate(z.object({ ...progressBase, status: z.string() }));

/** `metadata:enrich:progress`. */
export const enrichProgress = predicate(z.object({ ...progressBase, status: z.string() }));

/** `playlist:extract-progress`. */
export const extractProgress = predicate(z.object(progressBase));

/** `downloader:install-progress` and `downloader:ffmpeg-install-progress`. */
export const installProgress = predicate(z.object({ percent: z.number() }));

/** `downloader:dependency-install-progress`. */
export const dependencyInstallProgress = predicate(
  z.object({
    target: z.string(),
    percent: z.number(),
    overallPercent: z.number(),
    label: z.string(),
  })
);

/** `downloader:progress`. */
export const downloadProgress = predicate(
  z.object({ url: z.string(), progress: z.number(), status: z.string() })
);

/** `downloader:queue-state`. */
export const queueSnapshot = predicate(
  z.object({
    items: z.array(z.unknown()),
    maxConcurrency: z.number(),
    activeCount: z.number(),
    paused: z.boolean(),
  })
);

// ── the rest ──────────────────────────────────────────────────────────────

/** `system:notice`. */
export const systemNotice = predicate(
  z.object({ source: z.string(), level: z.string(), code: z.string() })
);

/**
 * `debug:metrics`.
 *
 * Asserts **v2's** shape, which is not v1's: §2.2 records the loss of the
 * per-Electron-process breakdown, the V8 heap and `process.getCPUUsage()`, none
 * of which exist behind a Tauri backend. Validating v1's shape here would drop
 * every sample the backend can actually produce.
 */
export const debugMetrics = predicate(
  z.object({
    ts: z.number(),
    procs: z.array(z.object({ kind: z.string(), pid: z.number(), cpu: z.number() })),
  })
);

/** `updater:update-available` and `updater:update-downloaded`. */
export const updateInfo = predicate(
  z.object({
    version: z.string(),
    releaseNotes: z.string().nullable(),
    releaseDate: z.string(),
  })
);

/** `updater:download-progress`. */
export const updateDownloadProgress = predicate(
  z.object({
    bytesPerSecond: z.number(),
    percent: z.number(),
    transferred: z.number(),
    total: z.number(),
  })
);
