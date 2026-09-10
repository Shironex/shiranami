import { describe, it, expect, beforeEach } from 'vitest';
import { MinIntervalGate } from './min-interval-gate';

/* ---------------------------------------------------------------- */
/*  Injected clock + sleep helpers.                                  */
/*                                                                    */
/*  The gate accepts `now` and `sleep` overrides, which we use        */
/*  instead of fake timers. A pending sleep is recorded and only      */
/*  resolves when the test manually advances the clock and calls      */
/*  `tick()`, which flushes microtasks so the gate can progress.      */
/* ---------------------------------------------------------------- */

let currentTime = 0;
let pendingSleeps: Array<{ dueAt: number; resolve: () => void }> = [];

const now = () => currentTime;
const sleep = (ms: number) =>
  new Promise<void>(resolve => {
    pendingSleeps.push({ dueAt: currentTime + ms, resolve });
  });

/** Flush queued microtasks so awaited promises settle. */
async function flush(): Promise<void> {
  // Multiple cycles let chained .then() callbacks resolve.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/** Advance clock and resolve any sleeps whose due time has passed. */
async function advance(ms: number): Promise<void> {
  currentTime += ms;
  await flush();
  // Resolve any due sleeps, then flush again.
  while (true) {
    const ready = pendingSleeps.filter(s => s.dueAt <= currentTime);
    if (ready.length === 0) break;
    pendingSleeps = pendingSleeps.filter(s => s.dueAt > currentTime);
    for (const s of ready) s.resolve();
    await flush();
  }
}

beforeEach(() => {
  currentTime = 0;
  pendingSleeps = [];
});

describe('MinIntervalGate', () => {
  it('run() resolves with fn return value', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    const result = await gate.run(async () => 'hello');
    expect(result).toBe('hello');
  });

  it('first call fires immediately (no waiting)', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    let ran = false;
    const p = gate.run(async () => {
      ran = true;
      return 1;
    });
    // No clock advance — microtask flush alone should execute the fn.
    await flush();
    expect(ran).toBe(true);
    expect(pendingSleeps).toHaveLength(0);
    await p;
  });

  it('second call waits minIntervalMs after first resolves', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    const starts: number[] = [];

    const p1 = gate.run(async () => {
      starts.push(currentTime);
    });
    const p2 = gate.run(async () => {
      starts.push(currentTime);
    });

    await flush();
    // First runs at t=0.
    expect(starts).toEqual([0]);
    // Second is now sleeping, waiting for the interval.
    expect(pendingSleeps).toHaveLength(1);
    expect(pendingSleeps[0].dueAt).toBe(1000);

    await advance(1000);
    expect(starts).toEqual([0, 1000]);

    await p1;
    await p2;
  });

  it('rejected fn does not stall the queue', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    const starts: number[] = [];

    const p1 = gate.run(async () => {
      starts.push(currentTime);
      throw new Error('boom');
    });
    const p2 = gate.run(async () => {
      starts.push(currentTime);
      return 'ok';
    });

    // Swallow the expected rejection.
    await expect(p1).rejects.toThrow('boom');

    // Second call should still be scheduled.
    await flush();
    expect(pendingSleeps).toHaveLength(1);

    await advance(1000);
    expect(starts).toEqual([0, 1000]);
    await expect(p2).resolves.toBe('ok');
  });

  it('preserves order across five sequential run() calls', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 500, now, sleep });
    const seen: number[] = [];

    const promises = [1, 2, 3, 4, 5].map(n =>
      gate.run(async () => {
        seen.push(n);
      })
    );

    // First runs immediately at t=0.
    await flush();
    expect(seen).toEqual([1]);

    for (let i = 2; i <= 5; i++) {
      await advance(500);
      expect(seen).toEqual([1, 2, 3, 4, 5].slice(0, i));
    }

    await Promise.all(promises);
  });

  it('bumpBy(5000) delays the next call by ~5 s', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    const starts: number[] = [];

    const p1 = gate.run(async () => {
      starts.push(currentTime);
    });
    await flush();
    expect(starts).toEqual([0]);
    await p1;

    // After first call, nextAllowedAt = 1000. bumpBy should push it to 5000.
    gate.bumpBy(5000);

    const p2 = gate.run(async () => {
      starts.push(currentTime);
    });
    await flush();
    // p2 should be sleeping until t=5000.
    expect(pendingSleeps).toHaveLength(1);
    expect(pendingSleeps[0].dueAt).toBe(5000);

    await advance(5000);
    expect(starts).toEqual([0, 5000]);
    await p2;
  });

  it('bumpBy(10_000) followed by bumpBy(1_000) still waits ~10 s', async () => {
    const gate = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });

    const p1 = gate.run(async () => {});
    await flush();
    await p1;

    gate.bumpBy(10_000);
    // Second bump is smaller — must not shorten the delay.
    gate.bumpBy(1_000);

    const starts: number[] = [];
    const p2 = gate.run(async () => {
      starts.push(currentTime);
    });
    await flush();
    expect(pendingSleeps[0].dueAt).toBe(10_000);

    await advance(10_000);
    expect(starts).toEqual([10_000]);
    await p2;
  });

  it('two separate gate instances do not block each other', async () => {
    const gateA = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    const gateB = new MinIntervalGate({ minIntervalMs: 1000, now, sleep });
    const starts: string[] = [];

    const pA = gateA.run(async () => {
      starts.push(`A@${currentTime}`);
    });
    const pB = gateB.run(async () => {
      starts.push(`B@${currentTime}`);
    });

    await flush();
    // Both should fire immediately — no pending sleeps.
    expect(pendingSleeps).toHaveLength(0);
    expect(starts.sort()).toEqual(['A@0', 'B@0']);

    await pA;
    await pB;
  });
});
