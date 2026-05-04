/**
 * Main-process host for the scan utility. Wraps `utilityProcess.fork()` into
 * an async client that the IPC layer can `await` against.
 *
 * Phase 2: hello/ack + init + parse round-trips. Each `parse(filePath)` call
 * returns the music-metadata + shiranami-art:// URL as decoded inside the
 * utility — cover Buffers do NOT cross the IPC boundary.
 *
 * Design context: docs/arch/2026-05-04-metadata-scan-utility-process-plan.md
 */

import * as path from 'path';
import { utilityProcess, type UtilityProcess } from 'electron';
import { logger } from './logger';

/**
 * Resolved path to the bundled utility entry. esbuild emits this alongside
 * `dist/main/index.js`, so `__dirname` resolution works in dev (esbuild
 * output) and packaged (asar) builds alike.
 */
function defaultUtilityEntry(): string {
  return path.join(__dirname, 'scan-utility.js');
}

const HELLO_TIMEOUT_MS = 5_000;
const READY_TIMEOUT_MS = 5_000;
const INIT_TIMEOUT_MS = 5_000;
/**
 * Window the utility has after a `cancel` postMessage to exit cleanly before
 * the host sends SIGTERM. Two seconds is generous: the utility's response is
 * to abandon the in-flight parse and call `process.exit(0)` — sub-millisecond
 * in the happy path. The fallback exists for the pathological case where a
 * native module (sharp, music-metadata) is mid-syscall and won't yield.
 */
const CANCEL_SIGTERM_DELAY_MS = 2_000;

/**
 * Error class thrown by pending parses when the host cancels mid-scan.
 * Surfaces to the IPC layer so callers can distinguish cancellation from
 * unexpected exits or parse rejections.
 */
export class ScanCancelledError extends Error {
  constructor(message = 'scan-utility cancelled') {
    super(message);
    this.name = 'ScanCancelledError';
  }
}
/**
 * No bound on parse — the utility owns concurrency and a slow file (network
 * mount, huge FLAC) can legitimately take seconds. Deadlocks are caught by
 * the host calling kill() at scan teardown.
 */

/** Metadata shape echoed back from the utility. Mirrors TrackMetadata. */
export interface ScanUtilityMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  albumArt: string | null;
}

export type ParseResult =
  | { ok: true; metadata: ScanUtilityMetadata }
  | { ok: false; error: string };

/**
 * Per-file progress event emitted by the host as each parse settles.
 * Mirrors the order parses are submitted in via `parse(filePath)`; consumers
 * can rely on `fileIndex` to identify which file the event refers to even when
 * parses complete out of order. `fileCount` is the number of parses submitted
 * to *this* client, set via `setBatchSize()` before the first parse.
 */
export interface ScanProgressEvent {
  filePath: string;
  fileIndex: number;
  fileCount: number;
  ok: boolean;
}

export type ScanProgressListener = (evt: ScanProgressEvent) => void;

export interface ScanUtilityClient {
  /** PID of the underlying utility process. */
  readonly pid: number;
  /** Resolves once the utility has posted `utility-ready`. */
  readonly ready: Promise<void>;
  /** Round-trip a hello/ack handshake. Resolves with the utility's PID. */
  hello(): Promise<{ pid: number }>;
  /** Send the userData path to the utility. Resolves on `init-ack`. */
  init(opts: { userDataPath: string }): Promise<void>;
  /** Parse one file. Resolves with metadata + shiranami-art:// URL. */
  parse(filePath: string): Promise<ParseResult>;
  /**
   * Set the total file count used in subsequent progress events. Callers
   * invoke this once per logical batch before the first `parse()`. Resets
   * the in-flight index counter to 0.
   */
  setBatchSize(fileCount: number): void;
  /** Subscribe to per-file progress events. Returns an unsubscribe function. */
  onProgress(listener: ScanProgressListener): () => void;
  /**
   * Request a graceful cancel: posts `{ type: 'cancel' }` to the utility,
   * rejects every pending parse with `ScanCancelledError` synchronously, and
   * arms a SIGTERM fallback that fires if the utility hasn't exited within
   * `CANCEL_SIGTERM_DELAY_MS`. Idempotent. After `cancel()`, `parse()` rejects
   * synchronously for the rest of this client's lifetime.
   */
  cancel(): void;
  /** Send SIGTERM and remove all listeners. Idempotent. */
  kill(): void;
  /** Whether `kill()` has been invoked or the process has exited. */
  readonly killed: boolean;
  /** Whether `cancel()` has been invoked. */
  readonly cancelled: boolean;
}

export interface ForkScanUtilityOptions {
  /** Override the bundled entry path (tests). */
  entryPath?: string;
  /** Override the spawner (tests). */
  fork?: typeof utilityProcess.fork;
}

interface UtilityMessage {
  type: string;
  [key: string]: unknown;
}

interface PendingHello {
  resolve: (value: { pid: number }) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingInit {
  resolve: () => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingParse {
  resolve: (value: ParseResult) => void;
  reject: (reason: Error) => void;
  filePath: string;
}

/**
 * Fork a fresh scan-utility process. Returns a client whose `ready` promise
 * resolves once the utility has signalled it is wired up.
 *
 * Caller must invoke `kill()` exactly once when done — usually inside a
 * try/finally around the scan loop.
 */
export function forkScanUtility(options: ForkScanUtilityOptions = {}): ScanUtilityClient {
  const entryPath = options.entryPath ?? defaultUtilityEntry();
  const forkFn = options.fork ?? utilityProcess.fork;

  const child: UtilityProcess = forkFn(entryPath, [], {
    serviceName: 'shiranami-scan-utility',
    stdio: 'pipe',
  });

  let killed = false;
  let cancelled = false;
  let cancelTimer: NodeJS.Timeout | null = null;
  let pendingHello: PendingHello | null = null;
  let pendingInit: PendingInit | null = null;
  /** Map of in-flight parse requests by ID, so utility messages can route back. */
  const pendingParses = new Map<number, PendingParse>();
  let nextRequestId = 1;

  /**
   * Progress accounting. `progressTotal` is the count provided by the IPC
   * layer via `setBatchSize()`; `progressEmitted` increments once per parse
   * settle (success OR fallback) so consumers see exactly one event per
   * submitted file in submission order.
   */
  let progressTotal = 0;
  let progressEmitted = 0;
  const progressListeners = new Set<ScanProgressListener>();

  function emitProgress(evt: ScanProgressEvent): void {
    for (const listener of progressListeners) {
      try {
        listener(evt);
      } catch (err) {
        logger.warn('[scan-utility-host] progress listener threw:', err);
      }
    }
  }

  let resolveReady: (() => void) | null = null;
  let rejectReady: ((reason: Error) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const readyTimer = setTimeout(() => {
    if (resolveReady) {
      const err = new Error(`scan-utility ready timeout (${READY_TIMEOUT_MS}ms)`);
      rejectReady?.(err);
      resolveReady = null;
      rejectReady = null;
    }
  }, READY_TIMEOUT_MS);
  // Don't keep the event loop alive just for this guard.
  readyTimer.unref?.();

  function rejectAllPending(reason: Error): void {
    if (pendingHello) {
      clearTimeout(pendingHello.timer);
      pendingHello.reject(reason);
      pendingHello = null;
    }
    if (pendingInit) {
      clearTimeout(pendingInit.timer);
      pendingInit.reject(reason);
      pendingInit = null;
    }
    for (const pending of pendingParses.values()) {
      pending.reject(reason);
    }
    pendingParses.clear();
  }

  child.on('message', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as UtilityMessage;

    switch (msg.type) {
      case 'utility-ready':
        if (resolveReady) {
          clearTimeout(readyTimer);
          resolveReady();
          resolveReady = null;
          rejectReady = null;
        }
        break;

      case 'hello-ack':
        if (pendingHello) {
          clearTimeout(pendingHello.timer);
          const pid = typeof msg.pid === 'number' ? msg.pid : (child.pid ?? -1);
          pendingHello.resolve({ pid });
          pendingHello = null;
        }
        break;

      case 'init-ack':
        if (pendingInit) {
          clearTimeout(pendingInit.timer);
          pendingInit.resolve();
          pendingInit = null;
        }
        break;

      case 'log': {
        const level =
          msg.level === 'info' ||
          msg.level === 'warn' ||
          msg.level === 'error' ||
          msg.level === 'debug'
            ? msg.level
            : 'info';
        const message = typeof msg.message === 'string' ? msg.message : String(msg.message);
        const args = Array.isArray(msg.args) ? msg.args : [];
        const prefixed = `[scan-utility] ${message}`;
        switch (level) {
          case 'error':
            logger.error(prefixed, ...args);
            break;
          case 'warn':
            logger.warn(prefixed, ...args);
            break;
          case 'debug':
            logger.debug(prefixed, ...args);
            break;
          default:
            logger.info(prefixed, ...args);
        }
        break;
      }

      case 'parse-result': {
        const requestId = typeof msg.requestId === 'number' ? msg.requestId : -1;
        const pending = pendingParses.get(requestId);
        if (!pending) {
          logger.warn(`[scan-utility-host] orphan parse-result requestId=${requestId}`);
          break;
        }
        pendingParses.delete(requestId);
        const ok = msg.ok === true;
        if (ok) {
          pending.resolve({
            ok: true,
            metadata: msg.metadata as ScanUtilityMetadata,
          });
        } else {
          pending.resolve({
            ok: false,
            error: typeof msg.error === 'string' ? msg.error : 'unknown utility parse error',
          });
        }
        // Emit progress in submission order — `fileIndex` is the count of
        // settled parses so far in this batch, capped at `fileCount` so a
        // mis-set batch size cannot drive the index past the total.
        const fileIndex = Math.min(progressEmitted + 1, Math.max(progressTotal, 1));
        progressEmitted++;
        emitProgress({
          filePath: pending.filePath,
          fileIndex,
          fileCount: progressTotal,
          ok,
        });
        break;
      }

      default:
        // Phase 3+ will add 'log', etc. Unknown types in Phase 2 are warnings,
        // not fatal — keeps the protocol additive.
        logger.warn(`[scan-utility-host] unknown message type: ${String(msg.type)}`);
    }
  });

  child.on('exit', (code: number | null) => {
    killed = true;
    clearTimeout(readyTimer);
    if (cancelTimer) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
    }
    if (resolveReady) {
      const err = new Error(`scan-utility exited before ready (code=${code ?? 'null'})`);
      rejectReady?.(err);
      resolveReady = null;
      rejectReady = null;
    }
    // If cancellation was already requested, surface ScanCancelledError to any
    // straggler pending parses so callers see the cancel reason instead of a
    // generic exit error.
    rejectAllPending(
      cancelled
        ? new ScanCancelledError(`scan-utility cancelled (exit code=${code ?? 'null'})`)
        : new Error(`scan-utility exited (code=${code ?? 'null'})`)
    );
  });

  // stderr stays piped as a crash fallback — if the utility explodes before
  // it can post a structured `log` message, anything it writes to stderr
  // still reaches main's logger. Stdout is intentionally NOT consumed here;
  // main posts structured `log` events over parentPort instead. (Reading
  // child.stdout in addition to the structured channel races with native
  // V8 logger writes that occasionally land on the same pipe.)
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trimEnd();
    if (text) logger.warn(`[scan-utility stderr] ${text}`);
  });

  return {
    get pid(): number {
      return child.pid ?? -1;
    },
    ready,
    async hello(): Promise<{ pid: number }> {
      if (killed) throw new Error('scan-utility already killed');
      if (pendingHello) {
        throw new Error('scan-utility hello already in flight');
      }

      return new Promise<{ pid: number }>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingHello = null;
          reject(new Error(`scan-utility hello timeout (${HELLO_TIMEOUT_MS}ms)`));
        }, HELLO_TIMEOUT_MS);
        timer.unref?.();
        pendingHello = { resolve, reject, timer };
        child.postMessage({ type: 'hello' });
      });
    },
    async init({ userDataPath }: { userDataPath: string }): Promise<void> {
      if (killed) throw new Error('scan-utility already killed');
      if (pendingInit) throw new Error('scan-utility init already in flight');

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingInit = null;
          reject(new Error(`scan-utility init timeout (${INIT_TIMEOUT_MS}ms)`));
        }, INIT_TIMEOUT_MS);
        timer.unref?.();
        pendingInit = { resolve, reject, timer };
        child.postMessage({ type: 'init', userDataPath });
      });
    },
    async parse(filePath: string): Promise<ParseResult> {
      // Check cancelled before killed: post-cancel, exit will mark `killed=true`
      // but the cause is the cancellation, so callers should see
      // `ScanCancelledError` rather than the generic "already killed".
      if (cancelled) throw new ScanCancelledError();
      if (killed) throw new Error('scan-utility already killed');
      const requestId = nextRequestId++;
      return new Promise<ParseResult>((resolve, reject) => {
        pendingParses.set(requestId, { resolve, reject, filePath });
        child.postMessage({ type: 'parse', requestId, filePath });
      });
    },
    setBatchSize(fileCount: number): void {
      progressTotal = Math.max(0, Math.floor(fileCount));
      progressEmitted = 0;
    },
    onProgress(listener: ScanProgressListener): () => void {
      progressListeners.add(listener);
      return () => {
        progressListeners.delete(listener);
      };
    },
    cancel(): void {
      if (cancelled || killed) return;
      cancelled = true;
      // Reject every in-flight parse synchronously so callers stop awaiting
      // immediately — the utility's exit will redundantly reject anything
      // still around, but the synchronous path matters for AbortSignal
      // propagation (the IPC layer wires `signal.aborted` to this method).
      rejectAllPending(new ScanCancelledError());
      try {
        child.postMessage({ type: 'cancel' });
      } catch (err) {
        logger.warn('[scan-utility-host] cancel postMessage threw:', err);
      }
      // Arm SIGTERM fallback. If the utility honours the cancel and exits
      // cleanly, `child.on('exit')` will clear this timer above.
      cancelTimer = setTimeout(() => {
        cancelTimer = null;
        if (!killed) {
          logger.warn(
            `[scan-utility-host] cancel SIGTERM fallback firing after ${CANCEL_SIGTERM_DELAY_MS}ms`
          );
          try {
            child.kill();
          } catch (err) {
            logger.warn('[scan-utility-host] SIGTERM kill threw:', err);
          }
        }
      }, CANCEL_SIGTERM_DELAY_MS);
      cancelTimer.unref?.();
    },
    kill(): void {
      if (killed) return;
      killed = true;
      clearTimeout(readyTimer);
      if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      if (resolveReady) {
        rejectReady?.(new Error('scan-utility killed before ready'));
        resolveReady = null;
        rejectReady = null;
      }
      rejectAllPending(
        cancelled
          ? new ScanCancelledError('scan-utility killed after cancel')
          : new Error('scan-utility killed')
      );
      try {
        child.kill();
      } catch (err) {
        logger.warn('[scan-utility-host] kill threw:', err);
      }
    },
    get killed(): boolean {
      return killed;
    },
    get cancelled(): boolean {
      return cancelled;
    },
  };
}
