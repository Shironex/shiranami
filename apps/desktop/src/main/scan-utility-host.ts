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
  /** Send SIGTERM and remove all listeners. Idempotent. */
  kill(): void;
  /** Whether `kill()` has been invoked or the process has exited. */
  readonly killed: boolean;
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
  let pendingHello: PendingHello | null = null;
  let pendingInit: PendingInit | null = null;
  /** Map of in-flight parse requests by ID, so utility messages can route back. */
  const pendingParses = new Map<number, PendingParse>();
  let nextRequestId = 1;

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

      case 'parse-result': {
        const requestId = typeof msg.requestId === 'number' ? msg.requestId : -1;
        const pending = pendingParses.get(requestId);
        if (!pending) {
          logger.warn(`[scan-utility-host] orphan parse-result requestId=${requestId}`);
          break;
        }
        pendingParses.delete(requestId);
        if (msg.ok === true) {
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
    if (resolveReady) {
      const err = new Error(`scan-utility exited before ready (code=${code ?? 'null'})`);
      rejectReady?.(err);
      resolveReady = null;
      rejectReady = null;
    }
    rejectAllPending(new Error(`scan-utility exited (code=${code ?? 'null'})`));
  });

  // stderr fallback — Phase 4 will replace this with a proper log bridge.
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trimEnd();
    if (text) logger.warn(`[scan-utility stderr] ${text}`);
  });

  // Drain stdout unconditionally. Sharp, music-metadata, and Node itself write
  // warnings there; if left unread, the 64 KB pipe buffer fills and the utility
  // stalls mid-scan.
  child.stdout?.on('data', () => {});

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
      if (killed) throw new Error('scan-utility already killed');
      const requestId = nextRequestId++;
      return new Promise<ParseResult>((resolve, reject) => {
        pendingParses.set(requestId, { resolve, reject });
        child.postMessage({ type: 'parse', requestId, filePath });
      });
    },
    kill(): void {
      if (killed) return;
      killed = true;
      clearTimeout(readyTimer);
      if (resolveReady) {
        rejectReady?.(new Error('scan-utility killed before ready'));
        resolveReady = null;
        rejectReady = null;
      }
      rejectAllPending(new Error('scan-utility killed'));
      try {
        child.kill();
      } catch (err) {
        logger.warn('[scan-utility-host] kill threw:', err);
      }
    },
    get killed(): boolean {
      return killed;
    },
  };
}
