import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import * as Sentry from '@sentry/electron/main';
import { ipcHandlers } from '../../../test/setup';
import { handle, handleWithFallback } from './with-ipc-handler';
import { decodeIpcError, IpcError } from './errors';

vi.mock('../app/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const event = null as never;

describe('handle()', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.mocked(Sentry.captureException).mockClear();
  });

  it('runs the handler normally when no schema is provided', async () => {
    const fn = vi.fn(async (_e: unknown, a: number, b: number) => a + b);
    handle<[number, number], number>('math:add', fn);

    const registered = ipcHandlers.get('math:add')!;
    const result = await registered(event, 2, 3);
    expect(result).toBe(5);
    expect(fn).toHaveBeenCalledWith(event, 2, 3);
  });

  it('passes parsed data to the handler when schema validation succeeds', async () => {
    const schema = z.tuple([z.string().min(1)]);
    const fn = vi.fn(async (_e: unknown, s: string) => `got:${s}`);
    handle<[string], string>('echo', fn, { schema });

    const registered = ipcHandlers.get('echo')!;
    const result = await registered(event, 'hello');
    expect(result).toBe('got:hello');
    expect(fn).toHaveBeenCalledWith(event, 'hello');
  });

  it('does not invoke the handler and throws a transport-encoded BAD_REQUEST when schema fails', async () => {
    const schema = z.tuple([z.string().min(1)]);
    const fn = vi.fn();
    handle<[string], string>('echo', fn, { schema });

    const registered = ipcHandlers.get('echo')!;
    let caught: unknown;
    try {
      await registered(event, 123);
    } catch (err) {
      caught = err;
    }

    // The error leaving ipcMain.handle is sentinel-encoded so its code/details
    // survive Electron's invoke serialization. Decode it back to assert shape.
    expect(caught).toBeInstanceOf(Error);
    const decoded = decodeIpcError((caught as Error).message);
    expect(decoded).not.toBeNull();
    expect(decoded!.code).toBe('BAD_REQUEST');
    expect(Array.isArray(decoded!.details)).toBe(true);
    expect((decoded!.details as unknown[]).length).toBeGreaterThan(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it('transport-encodes an IpcError thrown by the handler body', async () => {
    handle<[], string>('boom', async () => {
      const { IpcError } = await import('./errors');
      throw new IpcError('metadata.enrich_busy', 'busy', { slot: 1 });
    });

    const registered = ipcHandlers.get('boom')!;
    let caught: unknown;
    try {
      await registered(event);
    } catch (err) {
      caught = err;
    }

    const decoded = decodeIpcError((caught as Error).message);
    expect(decoded).toEqual({
      code: 'metadata.enrich_busy',
      message: 'busy',
      details: { slot: 1 },
    });
  });

  it('does not report expected IpcErrors to Sentry', async () => {
    handle<[], string>('boom', async () => {
      throw new IpcError('metadata.enrich_busy', 'busy');
    });

    const registered = ipcHandlers.get('boom')!;
    await expect(registered(event)).rejects.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports unexpected errors to Sentry', async () => {
    const unexpected = new Error('disk on fire');
    handle<[], string>('boom', async () => {
      throw unexpected;
    });

    const registered = ipcHandlers.get('boom')!;
    await expect(registered(event)).rejects.toThrow('disk on fire');
    expect(Sentry.captureException).toHaveBeenCalledWith(unexpected);
  });
});

describe('handleWithFallback()', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.mocked(Sentry.captureException).mockClear();
  });

  it('runs fallback on non-validation handler errors', async () => {
    const fallback = vi.fn(() => 'fallback-value');
    handleWithFallback<[], string>(
      'flaky',
      async () => {
        throw new Error('upstream down');
      },
      fallback
    );

    const registered = ipcHandlers.get('flaky')!;
    const result = await registered(event);
    expect(result).toBe('fallback-value');
    expect(fallback).toHaveBeenCalled();
  });

  it('does not report gracefully-degraded failures to Sentry', async () => {
    handleWithFallback<[], string>(
      'flaky',
      async () => {
        throw new Error('upstream down');
      },
      () => 'fallback-value'
    );

    const registered = ipcHandlers.get('flaky')!;
    await expect(registered(event)).resolves.toBe('fallback-value');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('bypasses fallback when schema validation fails and throws BAD_REQUEST', async () => {
    const schema = z.tuple([z.string().min(1)]);
    const handlerFn = vi.fn();
    const fallback = vi.fn(() => 'fallback-value');

    handleWithFallback<[string], string>('flaky', handlerFn, fallback, { schema });

    const registered = ipcHandlers.get('flaky')!;
    let caught: unknown;
    try {
      await registered(event, 42);
    } catch (err) {
      caught = err;
    }

    // Validation errors bypass the fallback and still transport-encode so the
    // renderer receives the structured BAD_REQUEST.
    const decoded = decodeIpcError((caught as Error).message);
    expect(decoded).not.toBeNull();
    expect(decoded!.code).toBe('BAD_REQUEST');
    expect(handlerFn).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('passes parsed args to the handler when schema validation succeeds', async () => {
    const schema = z.tuple([z.string().min(1)]);
    const handlerFn = vi.fn(async (_e: unknown, s: string) => `ok:${s}`);
    const fallback = vi.fn(() => 'fallback-value');

    handleWithFallback<[string], string>('flaky', handlerFn, fallback, { schema });

    const registered = ipcHandlers.get('flaky')!;
    const result = await registered(event, 'hi');
    expect(result).toBe('ok:hi');
    expect(fallback).not.toHaveBeenCalled();
  });
});
