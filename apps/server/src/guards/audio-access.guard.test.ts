import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { signAudioToken } from '../modules/youtube/youtube-audio';
import { AudioAccessGuard } from './audio-access.guard';

const API_KEY = 'super-secret-key';
const VIDEO = 'abcdefghijk';

function createConfig(apiKey?: string): ConfigService {
  return { get: () => apiKey } as unknown as ConfigService;
}

function createContext({
  headers = {},
  query = {},
  videoId = VIDEO,
}: {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  videoId?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, query, params: { videoId } }) }),
  } as unknown as ExecutionContext;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

describe('AudioAccessGuard', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies everything when no API key is configured', () => {
    const guard = new AudioAccessGuard(createConfig(undefined));
    const token = signAudioToken('', VIDEO, inAnHour());

    expect(() =>
      guard.canActivate(createContext({ headers: { 'x-shiranami-key': '' }, query: { t: token } }))
    ).toThrow(UnauthorizedException);
  });

  it('allows the key header', () => {
    const guard = new AudioAccessGuard(createConfig(API_KEY));

    expect(guard.canActivate(createContext({ headers: { 'x-shiranami-key': API_KEY } }))).toBe(
      true
    );
  });

  it('allows a valid token for this video', () => {
    const guard = new AudioAccessGuard(createConfig(API_KEY));
    const token = signAudioToken(API_KEY, VIDEO, inAnHour());

    expect(guard.canActivate(createContext({ query: { t: token } }))).toBe(true);
  });

  it('denies a token signed for another video', () => {
    const guard = new AudioAccessGuard(createConfig(API_KEY));
    const token = signAudioToken(API_KEY, 'zzzzzzzzzzz', inAnHour());

    expect(() => guard.canActivate(createContext({ query: { t: token } }))).toThrow(
      UnauthorizedException
    );
  });

  it('denies an expired token, a wrong key and no credentials at all', () => {
    const guard = new AudioAccessGuard(createConfig(API_KEY));
    const expired = signAudioToken(API_KEY, VIDEO, Math.floor(Date.now() / 1000) - 1);

    expect(() => guard.canActivate(createContext({ query: { t: expired } }))).toThrow(
      UnauthorizedException
    );
    expect(() =>
      guard.canActivate(createContext({ headers: { 'x-shiranami-key': 'wrong' } }))
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(createContext({}))).toThrow(UnauthorizedException);
  });

  it('denies a token passed more than once', () => {
    const guard = new AudioAccessGuard(createConfig(API_KEY));
    const token = signAudioToken(API_KEY, VIDEO, inAnHour());

    expect(() => guard.canActivate(createContext({ query: { t: [token, token] } }))).toThrow(
      UnauthorizedException
    );
  });
});
