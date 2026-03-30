import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  PORT: '3000',
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  SHARE_BASE_URL: 'https://api.shiranami.app',
  SHARE_TTL_SECONDS: '3600',
};

describe('validateEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadAndValidate() {
    const { validateEnv } = await import('./env');
    return validateEnv();
  }

  it('passes with a complete valid env', async () => {
    Object.assign(process.env, VALID_ENV);
    const env = await loadAndValidate();
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('exits when DATABASE_URL is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const envWithout = { ...VALID_ENV };
    delete (envWithout as Record<string, string | undefined>).DATABASE_URL;
    Object.assign(process.env, envWithout);
    // Clear DATABASE_URL explicitly in case it existed in the original env
    delete process.env.DATABASE_URL;

    await expect(loadAndValidate()).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('coerces PORT from string to number', async () => {
    Object.assign(process.env, { ...VALID_ENV, PORT: '8080' });
    const env = await loadAndValidate();
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('coerces SHARE_TTL_SECONDS from string to number', async () => {
    Object.assign(process.env, { ...VALID_ENV, SHARE_TTL_SECONDS: '7200' });
    const env = await loadAndValidate();
    expect(env.SHARE_TTL_SECONDS).toBe(7200);
  });

  it('applies default values when optional fields are omitted', async () => {
    // Only provide the required field
    process.env.DATABASE_URL = VALID_ENV.DATABASE_URL;
    // Remove optional fields that might exist from the original env
    delete process.env.REDIS_URL;
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.SHARE_BASE_URL;
    delete process.env.SHARE_TTL_SECONDS;

    const env = await loadAndValidate();
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SHARE_BASE_URL).toBe('https://api.shiranami.app');
    expect(env.SHARE_TTL_SECONDS).toBe(3600);
  });

  it('rejects an invalid NODE_ENV value', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    Object.assign(process.env, { ...VALID_ENV, NODE_ENV: 'staging' });

    await expect(loadAndValidate()).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
