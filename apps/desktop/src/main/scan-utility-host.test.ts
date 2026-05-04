import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Fake `UtilityProcess` — emits 'message' / 'exit' events and records
 * everything posted via `postMessage` for assertions. Mirrors the surface
 * `forkScanUtility` actually uses.
 */
class FakeUtilityProcess extends EventEmitter {
  pid = 4242;
  stderr = new EventEmitter();
  posted: unknown[] = [];
  killCalls = 0;

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }

  kill(): boolean {
    this.killCalls++;
    return true;
  }

  /** Push an `event.data`-style message from the utility back to main. */
  emitMessage(data: unknown): void {
    this.emit('message', data);
  }

  /** Simulate the child exiting with the given code. */
  emitExit(code: number | null): void {
    this.emit('exit', code);
  }
}

vi.mock('electron', () => ({
  utilityProcess: {
    fork: vi.fn(),
  },
}));

describe('forkScanUtility (Phase 1 plumbing)', () => {
  let fake: FakeUtilityProcess;
  let forkSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    fake = new FakeUtilityProcess();
    forkSpy = vi.fn().mockReturnValue(fake);
    const electron = await import('electron');
    vi.mocked(electron.utilityProcess.fork).mockImplementation(forkSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('forks the bundled scan-utility entry by default', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    forkScanUtility();
    expect(forkSpy).toHaveBeenCalledTimes(1);
    const [entry, args, opts] = forkSpy.mock.calls[0];
    expect(typeof entry).toBe('string');
    expect(entry).toMatch(/scan-utility\.js$/);
    expect(args).toEqual([]);
    expect(opts).toMatchObject({
      serviceName: 'shiranami-scan-utility',
      stdio: 'pipe',
    });
  });

  it('honours custom entryPath + fork override (test wiring)', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const customFork = vi.fn().mockReturnValue(fake);
    forkScanUtility({ entryPath: '/tmp/custom.js', fork: customFork as never });
    expect(customFork).toHaveBeenCalledWith(
      '/tmp/custom.js',
      [],
      expect.objectContaining({ serviceName: 'shiranami-scan-utility' })
    );
    expect(forkSpy).not.toHaveBeenCalled();
  });

  it('exposes the child PID', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    expect(client.pid).toBe(4242);
  });

  it('resolves ready when utility-ready arrives', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();

    fake.emitMessage({ type: 'utility-ready' });
    await expect(client.ready).resolves.toBeUndefined();
  });

  it('rejects ready when utility exits before signalling ready', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();

    fake.emitExit(7);
    await expect(client.ready).rejects.toThrow(/exited before ready/);
  });

  it('rejects ready when the timeout fires before utility-ready arrives', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();

    // Attach a catch handler synchronously so the rejection isn't unhandled
    // when the fake timer trips.
    const readyAssertion = expect(client.ready).rejects.toThrow(/ready timeout/);
    await vi.advanceTimersByTimeAsync(5_000);
    await readyAssertion;
  });

  it('round-trips hello → hello-ack with the utility PID', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const promise = client.hello();
    expect(fake.posted).toEqual([{ type: 'hello' }]);
    fake.emitMessage({ type: 'hello-ack', pid: 9999 });

    await expect(promise).resolves.toEqual({ pid: 9999 });
  });

  it('rejects hello when the timeout fires before hello-ack', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const helloAssertion = expect(client.hello()).rejects.toThrow(/hello timeout/);
    await vi.advanceTimersByTimeAsync(5_000);
    await helloAssertion;
  });

  it('rejects hello when the utility exits mid-handshake', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const promise = client.hello();
    fake.emitExit(1);
    await expect(promise).rejects.toThrow(/scan-utility exited/);
  });

  it('rejects hello when called after kill()', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;
    client.kill();

    await expect(client.hello()).rejects.toThrow(/already killed/);
  });

  it('rejects a second hello while one is in flight', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const first = client.hello();
    await expect(client.hello()).rejects.toThrow(/already in flight/);
    fake.emitMessage({ type: 'hello-ack', pid: 9999 });
    await expect(first).resolves.toEqual({ pid: 9999 });
  });

  it('kill() invokes child.kill once and is idempotent', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    expect(client.killed).toBe(false);

    // Suppress the ready rejection so Node doesn't see an unhandled rejection
    // when kill() fires before utility-ready arrives.
    client.ready.catch(() => {});

    client.kill();
    client.kill();
    expect(client.killed).toBe(true);
    expect(fake.killCalls).toBe(1);
  });

  it('marks killed=true and rejects pending hello when child emits exit', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const promise = client.hello();
    fake.emitExit(0);

    expect(client.killed).toBe(true);
    await expect(promise).rejects.toThrow(/scan-utility exited/);
  });

  it('ignores non-object messages safely', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage(null);
    fake.emitMessage('string');
    fake.emitMessage(123);
    fake.emitMessage({ type: 'utility-ready' });
    await expect(client.ready).resolves.toBeUndefined();
  });

  it('emits one progress event per parse in submission order', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const events: Array<{ filePath: string; fileIndex: number; fileCount: number; ok: boolean }> =
      [];
    client.onProgress(evt => events.push(evt));
    client.setBatchSize(3);

    const files = ['/a.flac', '/b.flac', '/c.flac'];
    const promises = files.map(p => client.parse(p));

    // Reply in submission order; each parse-result triggers a progress event.
    fake.emitMessage({
      type: 'parse-result',
      requestId: 1,
      ok: true,
      metadata: { title: 'a' },
    });
    fake.emitMessage({
      type: 'parse-result',
      requestId: 2,
      ok: false,
      error: 'boom',
    });
    fake.emitMessage({
      type: 'parse-result',
      requestId: 3,
      ok: true,
      metadata: { title: 'c' },
    });

    await Promise.all(promises);

    expect(events).toEqual([
      { filePath: '/a.flac', fileIndex: 1, fileCount: 3, ok: true },
      { filePath: '/b.flac', fileIndex: 2, fileCount: 3, ok: false },
      { filePath: '/c.flac', fileIndex: 3, fileCount: 3, ok: true },
    ]);
  });

  it('caps fileIndex at fileCount when more parses settle than the batch size', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    const events: Array<{ filePath: string; fileIndex: number }> = [];
    client.onProgress(evt => events.push({ filePath: evt.filePath, fileIndex: evt.fileIndex }));
    client.setBatchSize(1);

    const p1 = client.parse('/a.flac');
    const p2 = client.parse('/b.flac');
    fake.emitMessage({ type: 'parse-result', requestId: 1, ok: true, metadata: { title: 'a' } });
    fake.emitMessage({ type: 'parse-result', requestId: 2, ok: true, metadata: { title: 'b' } });
    await Promise.all([p1, p2]);

    expect(events.map(e => e.fileIndex)).toEqual([1, 1]);
  });

  it('unsubscribe removes a single progress listener without affecting others', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;
    client.setBatchSize(1);

    const a: number[] = [];
    const b: number[] = [];
    const unsubA = client.onProgress(evt => a.push(evt.fileIndex));
    client.onProgress(evt => b.push(evt.fileIndex));

    const p1 = client.parse('/x.flac');
    fake.emitMessage({ type: 'parse-result', requestId: 1, ok: true, metadata: { title: 'x' } });
    await p1;

    unsubA();
    client.setBatchSize(1);
    const p2 = client.parse('/y.flac');
    fake.emitMessage({ type: 'parse-result', requestId: 2, ok: true, metadata: { title: 'y' } });
    await p2;

    expect(a).toEqual([1]);
    expect(b).toEqual([1, 1]);
  });

  it("forwards utility log messages to main's logger by level", async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const { logger } = await import('./logger');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    fake.emitMessage({ type: 'log', level: 'info', message: 'hello world', args: [{ a: 1 }] });
    fake.emitMessage({
      type: 'log',
      level: 'warn',
      message: 'cover write failed for /x.flac',
      args: [],
    });
    fake.emitMessage({ type: 'log', level: 'error', message: 'boom', args: ['extra'] });
    fake.emitMessage({ type: 'log', level: 'debug', message: 'tracing', args: [] });

    expect(logger.info).toHaveBeenCalledWith('[scan-utility] hello world', { a: 1 });
    expect(logger.warn).toHaveBeenCalledWith('[scan-utility] cover write failed for /x.flac');
    expect(logger.error).toHaveBeenCalledWith('[scan-utility] boom', 'extra');
    expect(logger.debug).toHaveBeenCalledWith('[scan-utility] tracing');

    // Sanity: 'unknown message type' warn wasn't tripped for the structured logs.
    const unknownWarns = vi
      .mocked(logger.warn)
      .mock.calls.filter(
        args => typeof args[0] === 'string' && args[0].includes('unknown message type')
      );
    expect(unknownWarns).toEqual([]);

    // Stop the channel so the test cleans up — kill() rejects pending state.
    client.kill();
  });

  it('falls back to info when an unknown log level arrives', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const { logger } = await import('./logger');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    fake.emitMessage({ type: 'log', level: 'trace', message: 'mystery', args: [] });
    expect(logger.info).toHaveBeenCalledWith('[scan-utility] mystery');

    client.kill();
  });

  it('cancel() rejects pending parses with ScanCancelledError and posts cancel', async () => {
    const { forkScanUtility, ScanCancelledError } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;
    client.setBatchSize(2);

    const p1 = client.parse('/a.flac');
    const p2 = client.parse('/b.flac');

    // Suppress unhandled-rejection between cancel() and our awaits below.
    p1.catch(() => {});
    p2.catch(() => {});

    client.cancel();

    expect(client.cancelled).toBe(true);
    await expect(p1).rejects.toBeInstanceOf(ScanCancelledError);
    await expect(p2).rejects.toBeInstanceOf(ScanCancelledError);
    expect(fake.posted).toContainEqual({ type: 'cancel' });

    // Subsequent parse() throws synchronously.
    await expect(client.parse('/c.flac')).rejects.toBeInstanceOf(ScanCancelledError);

    // Clean shutdown — utility "exits" before SIGTERM.
    fake.emitExit(0);
    expect(fake.killCalls).toBe(0);
  });

  it('cancel() arms a SIGTERM fallback when the utility ignores the cancel', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    client.cancel();
    expect(fake.killCalls).toBe(0);

    // The fake never emits exit; advance past the SIGTERM delay.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fake.killCalls).toBe(1);
  });

  it('cancel() is a no-op after kill()', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();
    fake.emitMessage({ type: 'utility-ready' });
    await client.ready;

    client.kill();
    client.cancel();
    expect(client.cancelled).toBe(false);
    // Cancel after kill must not post anything new.
    expect(fake.posted.filter(m => (m as { type?: string }).type === 'cancel')).toEqual([]);
  });

  it('cancel() before utility-ready rejects ready and posts cancel', async () => {
    const { forkScanUtility, ScanCancelledError } = await import('./scan-utility-host');
    const client = forkScanUtility();
    // Capture the rejection synchronously so cancel() doesn't trigger an
    // unhandled rejection before the test awaits.
    const readyAssertion = expect(client.ready).rejects.toThrow();

    client.cancel();
    expect(client.cancelled).toBe(true);

    // Simulate utility honouring cancel and exiting cleanly.
    fake.emitExit(0);

    await readyAssertion;
    // Subsequent parse() rejects synchronously.
    await expect(client.parse('/x.flac')).rejects.toBeInstanceOf(ScanCancelledError);
  });

  it('rejects ready synchronously when kill() is called before utility-ready arrives', async () => {
    const { forkScanUtility } = await import('./scan-utility-host');
    const client = forkScanUtility();

    // Capture the rejection before kill() fires it so Node does not see an
    // unhandled rejection. The assertion is resolved after kill() returns.
    const readyResult = client.ready.then(
      () => ({ threw: false, error: null as Error | null }),
      (err: Error) => ({ threw: true, error: err })
    );

    // kill() while utility-ready has not been posted yet.
    client.kill();

    const { threw, error } = await readyResult;
    expect(threw).toBe(true);
    expect(error?.message).toMatch(/killed before ready/);
  });
});
