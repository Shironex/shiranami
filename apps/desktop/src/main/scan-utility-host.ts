/**
 * Main-process host for the scan utility. Wraps `utilityProcess.fork()` into
 * an async client that the IPC layer can `await` against.
 *
 * Phase 1 scope: hello/ack round-trip + clean kill. Phase 2 will add the
 * `init` and `parse` message types and full lifecycle.
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

export interface ScanUtilityClient {
  /** PID of the underlying utility process. */
  readonly pid: number;
  /** Resolves once the utility has posted `utility-ready`. */
  readonly ready: Promise<void>;
  /** Round-trip a hello/ack handshake. Resolves with the utility's PID. */
  hello(): Promise<{ pid: number }>;
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

      default:
        // Phase 2 will add 'parse-result', 'log', etc. Unknown types in
        // Phase 1 are warnings, not fatal — keeps the protocol additive.
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
    if (pendingHello) {
      clearTimeout(pendingHello.timer);
      pendingHello.reject(
        new Error(`scan-utility exited before hello-ack (code=${code ?? 'null'})`)
      );
      pendingHello = null;
    }
  });

  // stderr fallback — Phase 4 will replace this with a proper log bridge.
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
    kill(): void {
      if (killed) return;
      killed = true;
      clearTimeout(readyTimer);
      if (pendingHello) {
        clearTimeout(pendingHello.timer);
        pendingHello.reject(new Error('scan-utility killed'));
        pendingHello = null;
      }
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
