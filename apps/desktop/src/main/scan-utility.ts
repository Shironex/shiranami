/**
 * Scan utility process — runs music-metadata parsing and embedded-cover
 * decode/downscale/disk-write off the Electron main process. Forked per scan
 * via `utilityProcess.fork()` from `scan-utility-host.ts`; exits when the
 * scan completes so the OS reclaims the V8 heap (the entire point of the
 * migration).
 *
 * Handles `init` (receives userData path) and `parse` (decodes one file,
 * writes any embedded cover to disk under `userData/album-art/`, returns
 * metadata + shiranami-art:// URL). Cover Buffers do NOT cross the IPC
 * boundary. Forwards structured `log` events back to main and exits cleanly
 * on `cancel`.
 *
 * IMPORTANT: parentPort.on('message') wraps each message in a MessageEvent —
 * the actual payload lives at `event.data`. This is asymmetric with the parent
 * side, where `UtilityProcess.on('message')` already unwraps to the raw data.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackMetadata } from '@shiranami/contracts';
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM } from '@shiranami/shared';
import { artUrlFor, downscaleAndHash } from './lib/album-art-image';

interface ParentPortMessageEvent {
  data: unknown;
}

interface ParentPortLike {
  on(event: 'message', listener: (event: ParentPortMessageEvent) => void): void;
  postMessage(msg: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

if (!parentPort) {
  // Running outside utilityProcess — fail loudly. The host always forks via
  // utilityProcess.fork() so this is a wiring bug if it ever fires.
  console.error('[scan-utility] parentPort missing — not running inside utilityProcess');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Wire types — keep in sync with scan-utility-host.ts.
// ---------------------------------------------------------------------------

interface HelloMessage {
  type: 'hello';
}
interface InitMessage {
  type: 'init';
  userDataPath: string;
}
interface ParseMessage {
  type: 'parse';
  requestId: number;
  filePath: string;
}
interface CancelMessage {
  type: 'cancel';
}

type IncomingMessage = HelloMessage | InitMessage | ParseMessage | CancelMessage;

interface UtilityReadyMessage {
  type: 'utility-ready';
}
interface HelloAckMessage {
  type: 'hello-ack';
  pid: number;
}
interface InitAckMessage {
  type: 'init-ack';
}

type ParseSuccessMetadata = TrackMetadata;
interface ParseSuccessMessage {
  type: 'parse-result';
  requestId: number;
  ok: true;
  metadata: ParseSuccessMetadata;
}
interface ParseErrorMessage {
  type: 'parse-result';
  requestId: number;
  ok: false;
  error: string;
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogMessage {
  type: 'log';
  level: LogLevel;
  message: string;
  args?: unknown[];
}

type OutgoingMessage =
  | UtilityReadyMessage
  | HelloAckMessage
  | InitAckMessage
  | ParseSuccessMessage
  | ParseErrorMessage
  | LogMessage;

function post(msg: OutgoingMessage): void {
  parentPort!.postMessage(msg);
}

/**
 * Forwarding logger — every call posts a structured `log` message to the
 * host, which dispatches it into main's logger. This replaces direct
 * `console.error` / `console.log` so log fidelity (level, prefix, file
 * transport) survives the process boundary.
 *
 * Args are forwarded as-is. Non-serialisable values (Errors, circular
 * objects) get a best-effort toString fallback so the IPC postMessage
 * structured-clone never throws.
 */
function safeArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (arg instanceof Error) {
      return { name: arg.name, message: arg.message, stack: arg.stack };
    }
    try {
      // Trip the structured-clone restriction early — if it would fail at
      // postMessage time, fall back to a string repr now.
      JSON.stringify(arg);
      return arg;
    } catch {
      try {
        return String(arg);
      } catch {
        return '[unserialisable]';
      }
    }
  });
}

const log = {
  info: (message: string, ...args: unknown[]): void =>
    post({ type: 'log', level: 'info', message, args: safeArgs(args) }),
  warn: (message: string, ...args: unknown[]): void =>
    post({ type: 'log', level: 'warn', message, args: safeArgs(args) }),
  error: (message: string, ...args: unknown[]): void =>
    post({ type: 'log', level: 'error', message, args: safeArgs(args) }),
  debug: (message: string, ...args: unknown[]): void =>
    post({ type: 'log', level: 'debug', message, args: safeArgs(args) }),
};

// ---------------------------------------------------------------------------
// Lazy module + state
// ---------------------------------------------------------------------------

let mmModule: typeof import('music-metadata') | null = null;
async function getMusicMetadata(): Promise<typeof import('music-metadata')> {
  if (!mmModule) {
    mmModule = await import('music-metadata');
  }
  return mmModule;
}

interface UtilityState {
  userDataPath: string;
  artDir: string;
  artDirEnsured: boolean;
}

let state: UtilityState | null = null;
/**
 * Set by the `cancel` handler. Once true, in-flight parses suppress their
 * `parse-result` reply (the host has already rejected the corresponding
 * promises with ScanCancelledError) and the process exits cleanly.
 */
let cancelled = false;

function ensureArtDir(s: UtilityState): void {
  if (s.artDirEnsured) return;
  if (!fs.existsSync(s.artDir)) {
    fs.mkdirSync(s.artDir, { recursive: true });
  }
  s.artDirEnsured = true;
}

// ---------------------------------------------------------------------------
// Cover write — content-addressed JPEG cache. Mirrors saveAlbumArt() in
// art-protocol.ts but uses sharp (via downscaleAndHash) and does no logging.
// Returns the protocol URL or null when there is nothing to save.
// ---------------------------------------------------------------------------

async function saveAlbumArtToDisk(
  s: UtilityState,
  data: Buffer | Uint8Array
): Promise<string | null> {
  const downscaled = await downscaleAndHash(data);
  if (!downscaled) return null;

  ensureArtDir(s);
  const filePath = path.join(s.artDir, downscaled.fileName);

  try {
    await fs.promises.writeFile(filePath, downscaled.bytes, { flag: 'wx' });
  } catch (error: unknown) {
    // EEXIST is the dedup happy-path — content-addressed naming means a
    // duplicate write is a no-op. Any other error gets surfaced.
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== 'EEXIST') {
      throw error;
    }
  }

  return artUrlFor(downscaled.fileName);
}

// ---------------------------------------------------------------------------
// Parse one file. Mirrors parseAudioMetadata() in metadata-service.ts but
// without the logger import (Phase 4 will wire a log bridge). Errors are
// swallowed and surface as the same fallback metadata shape main expects.
// ---------------------------------------------------------------------------

async function parseFile(s: UtilityState, filePath: string): Promise<ParseSuccessMetadata> {
  const mm = await getMusicMetadata();
  const fallbackTitle = path.basename(filePath, path.extname(filePath));

  try {
    const metadata = await mm.parseFile(filePath, { skipCovers: false });
    const common = metadata.common;
    const format = metadata.format;

    let albumArt: string | null = null;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      try {
        albumArt = await saveAlbumArtToDisk(s, pic.data);
      } catch (err) {
        // Cover failure shouldn't sink the whole track — log and fall through.
        log.warn(`cover write failed for ${filePath}`, err);
      }
    }

    return {
      title: common.title || fallbackTitle,
      artist: common.artist || UNKNOWN_ARTIST,
      // Only the dedicated albumartist tag — do NOT fall back to the track
      // artist, or an untagged various-artists album gets a per-track album
      // artist and fragments at grouping time (#269). Null means "untagged",
      // which the grouping layer keys on the album title alone.
      albumArtist: common.albumartist?.trim() || null,
      album: common.album || UNKNOWN_ALBUM,
      duration: format.duration || 0,
      genre: common.genre?.[0] || '',
      year: common.year || null,
      trackNumber: common.track?.no ?? null,
      discNumber: common.disk?.no ?? null,
      albumArt,
    };
  } catch (err) {
    log.warn(`parse failed for ${filePath}`, err);
    return {
      title: fallbackTitle,
      artist: UNKNOWN_ARTIST,
      albumArtist: null,
      album: UNKNOWN_ALBUM,
      duration: 0,
      genre: '',
      year: null,
      trackNumber: null,
      discNumber: null,
      albumArt: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Message dispatcher
// ---------------------------------------------------------------------------

function handleParse(msg: ParseMessage): void {
  if (cancelled) {
    // Host has already rejected the matching pending promise; sending a
    // `parse-result` now would either log an "orphan" warning or race with
    // the exit-driven rejection.
    return;
  }
  if (!state) {
    post({
      type: 'parse-result',
      requestId: msg.requestId,
      ok: false,
      error: 'utility not initialised — main must send init before parse',
    });
    return;
  }

  // Run async work without blocking the message loop.
  void parseFile(state, msg.filePath).then(
    metadata => {
      if (cancelled) return;
      post({ type: 'parse-result', requestId: msg.requestId, ok: true, metadata });
    },
    err => {
      if (cancelled) return;
      // parseFile already returns fallback metadata for parser-side errors;
      // a rejection here means something fundamental (out of memory, etc.).
      post({
        type: 'parse-result',
        requestId: msg.requestId,
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  );
}

parentPort.on('message', event => {
  const msg = event.data as IncomingMessage | undefined;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'hello':
      post({ type: 'hello-ack', pid: process.pid });
      return;

    case 'init':
      if (!state) {
        const userDataPath = msg.userDataPath;
        state = {
          userDataPath,
          artDir: path.join(userDataPath, 'album-art'),
          artDirEnsured: false,
        };
      }
      post({ type: 'init-ack' });
      return;

    case 'parse':
      handleParse(msg);
      return;

    case 'cancel':
      // Mark cancelled so any in-flight parseFile() suppresses its reply, then
      // exit cleanly. The host's SIGTERM fallback only fires if this exit
      // never arrives — usually we beat it by hundreds of milliseconds.
      if (cancelled) return;
      cancelled = true;
      // Defer the exit one tick so the current message handler returns
      // before the runtime tears down.
      setImmediate(() => {
        process.exit(0);
      });
      return;

    default:
      // Unknown types are ignored — keeps the protocol additive for Phase 3+.
      return;
  }
});

// Signal readiness so the parent knows the IPC listener is wired.
post({ type: 'utility-ready' });
