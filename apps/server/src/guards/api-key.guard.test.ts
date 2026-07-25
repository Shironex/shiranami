import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

const API_KEY = 'super-secret-key';

function createConfig(apiKey?: string): ConfigService {
  return { get: () => apiKey } as unknown as ConfigService;
}

function createContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies the request when no API key is configured', () => {
    const guard = new ApiKeyGuard(createConfig(undefined));

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('denies the request when no API key is configured even with a header present', () => {
    const guard = new ApiKeyGuard(createConfig(undefined));

    expect(() => guard.canActivate(createContext({ 'x-shiranami-key': API_KEY }))).toThrow(
      UnauthorizedException
    );
  });

  it('denies the request when the key header is missing', () => {
    const guard = new ApiKeyGuard(createConfig(API_KEY));

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('denies the request when the key header does not match', () => {
    const guard = new ApiKeyGuard(createConfig(API_KEY));

    expect(() => guard.canActivate(createContext({ 'x-shiranami-key': 'wrong-key' }))).toThrow(
      UnauthorizedException
    );
  });

  it('allows the request when the key header matches', () => {
    const guard = new ApiKeyGuard(createConfig(API_KEY));

    expect(guard.canActivate(createContext({ 'x-shiranami-key': API_KEY }))).toBe(true);
  });
});
