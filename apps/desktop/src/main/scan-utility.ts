/**
 * Scan utility process — runs music-metadata parsing and embedded-cover
 * decode/downscale/disk-write off the Electron main process. Forked per scan
 * via `utilityProcess.fork()` from `scan-utility-host.ts`; exits when the
 * scan completes so the OS reclaims the V8 heap (the entire point of the
 * migration).
 *
 * Phase 1 scope: skeleton only. Listens for `hello` and replies `hello-ack`.
 * Real parse/cover-write logic lands in Phase 2.
 *
 * Design context: docs/arch/2026-05-04-metadata-scan-utility-process-plan.md
 *
 * IMPORTANT: parentPort.on('message') wraps each message in a MessageEvent —
 * the actual payload lives at `event.data`. This is asymmetric with the parent
 * side, where `UtilityProcess.on('message')` already unwraps to the raw data.
 */

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

interface HelloMessage {
  type: 'hello';
}

interface HelloAckMessage {
  type: 'hello-ack';
  pid: number;
}

interface UtilityReadyMessage {
  type: 'utility-ready';
}

type IncomingMessage = HelloMessage;
type OutgoingMessage = HelloAckMessage | UtilityReadyMessage;

function post(msg: OutgoingMessage): void {
  parentPort!.postMessage(msg);
}

parentPort.on('message', event => {
  const msg = event.data as IncomingMessage | undefined;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'hello') {
    post({ type: 'hello-ack', pid: process.pid });
    return;
  }
});

// Signal readiness so the parent knows the IPC listener is wired.
post({ type: 'utility-ready' });
