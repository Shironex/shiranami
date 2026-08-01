import { beforeEach, describe, expect, it } from 'vitest';
import { useDebugStore, type LongTaskEntry } from './useDebugStore';
import type { MetricsSnapshot } from '@shiranami/contracts/bindings';

function resetStore() {
  useDebugStore.getState().close();
  useDebugStore.getState().reset();
}

function makeSnapshot(): MetricsSnapshot {
  return {
    ts: 1,
    procs: [{ kind: 'main', pid: 1, cpu: 5, mem: 1024 }],
  };
}

function makeLongTask(ts: number): LongTaskEntry {
  return { ts, kind: 'longtask', duration: 80, name: '' };
}

describe('useDebugStore', () => {
  beforeEach(resetStore);

  it('starts closed with no data', () => {
    const s = useDebugStore.getState();
    expect(s.open).toBe(false);
    expect(s.main).toBeNull();
    expect(s.longTasks).toEqual([]);
  });

  it('toggle flips the open flag', () => {
    useDebugStore.getState().toggle();
    expect(useDebugStore.getState().open).toBe(true);
    useDebugStore.getState().toggle();
    expect(useDebugStore.getState().open).toBe(false);
  });

  it('close always sets open to false', () => {
    useDebugStore.getState().toggle();
    useDebugStore.getState().close();
    expect(useDebugStore.getState().open).toBe(false);
  });

  it('setMain stores the latest snapshot', () => {
    const snap = makeSnapshot();
    useDebugStore.getState().setMain(snap);
    expect(useDebugStore.getState().main).toEqual(snap);
  });

  it('pushLongTask prepends newest first and caps the ring buffer at 30', () => {
    for (let i = 0; i < 35; i++) {
      useDebugStore.getState().pushLongTask(makeLongTask(i));
    }
    const tasks = useDebugStore.getState().longTasks;
    expect(tasks).toHaveLength(30);
    expect(tasks[0].ts).toBe(34);
    expect(tasks[29].ts).toBe(5);
  });

  it('reset clears main, renderer, and long tasks', () => {
    useDebugStore.getState().setMain(makeSnapshot());
    useDebugStore.getState().pushLongTask(makeLongTask(1));
    useDebugStore.getState().reset();
    const s = useDebugStore.getState();
    expect(s.main).toBeNull();
    expect(s.longTasks).toEqual([]);
    expect(s.renderer.fps).toBe(0);
  });
});
