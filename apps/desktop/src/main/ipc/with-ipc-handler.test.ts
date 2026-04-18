import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ipcHandlers } from '../../../test/setup';
import { handle, handleWithFallback } from './with-ipc-handler';
import { IpcError } from './errors';

vi.mock('../logger', () => ({
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

  it('does not invoke the handler and throws IpcError BAD_REQUEST when schema fails', async () => {
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

    expect(caught).toBeInstanceOf(IpcError);
    const ipcErr = caught as IpcError;
    expect(ipcErr.code).toBe('BAD_REQUEST');
    expect(ipcErr.details).toBeDefined();
    expect(Array.isArray(ipcErr.details)).toBe(true);
    expect((ipcErr.details as unknown[]).length).toBeGreaterThan(0);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('handleWithFallback()', () => {
  beforeEach(() => {
    ipcHandlers.clear();
  });

  it('runs fallback on non-validation handler errors', async () => {
    const fallback = vi.fn(() => 'fallback-value');
    handleWithFallback<[], string>(
      'flaky',
      async () => {
        throw new Error('upstream down');
      },
      fallback,
    );

    const registered = ipcHandlers.get('flaky')!;
    const result = await registered(event);
    expect(result).toBe('fallback-value');
    expect(fallback).toHaveBeenCalled();
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

    expect(caught).toBeInstanceOf(IpcError);
    expect((caught as IpcError).code).toBe('BAD_REQUEST');
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
