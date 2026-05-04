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
