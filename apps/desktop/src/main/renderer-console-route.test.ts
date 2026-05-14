import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeRendererConsoleMessage, type RendererConsoleEvent } from './renderer-console-route';

function makeLog() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeEvent(overrides: Partial<RendererConsoleEvent> = {}): RendererConsoleEvent {
  return {
    level: 'warning',
    message: 'hello from renderer',
    lineNumber: 42,
    sourceId: 'http://localhost/foo.js',
    ...overrides,
  };
}

describe('routeRendererConsoleMessage (Electron 35+ event-object signature)', () => {
  let log: ReturnType<typeof makeLog>;

  beforeEach(() => {
    log = makeLog();
  });

  it('routes a warning to logger.warn with sourceId:lineNumber suffix', () => {
    routeRendererConsoleMessage(makeEvent({ level: 'warning' }), log);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      '[renderer] hello from renderer',
      'http://localhost/foo.js:42'
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  it('routes an error to logger.error', () => {
    routeRendererConsoleMessage(makeEvent({ level: 'error', message: 'boom' }), log);

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('[renderer] boom', 'http://localhost/foo.js:42');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('drops info-level messages', () => {
    routeRendererConsoleMessage(makeEvent({ level: 'info' }), log);

    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('drops debug-level messages', () => {
    routeRendererConsoleMessage(makeEvent({ level: 'debug' }), log);

    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('filters Electron Security Warning noise', () => {
    routeRendererConsoleMessage(
      makeEvent({
        level: 'warning',
        message: 'Electron Security Warning (Insecure Content-Security-Policy)',
      }),
      log
    );

    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('filters Vite HMR noise', () => {
    routeRendererConsoleMessage(
      makeEvent({ level: 'warning', message: '[vite] hot updated: /src/App.tsx' }),
      log
    );

    expect(log.warn).not.toHaveBeenCalled();
  });

  it('filters MediaImage src noise even when level is error', () => {
    routeRendererConsoleMessage(
      makeEvent({ level: 'error', message: 'MediaImage src can only be of http(s)/data/blob' }),
      log
    );

    expect(log.error).not.toHaveBeenCalled();
  });

  it('filters React DevTools promo', () => {
    routeRendererConsoleMessage(
      makeEvent({ level: 'warning', message: 'Download the React DevTools for a better dev XP' }),
      log
    );

    expect(log.warn).not.toHaveBeenCalled();
  });

  it('filters i18next promo', () => {
    routeRendererConsoleMessage(
      makeEvent({ level: 'warning', message: 'i18next is made possible by the community' }),
      log
    );

    expect(log.warn).not.toHaveBeenCalled();
  });

  it('omits the source suffix when sourceId is empty', () => {
    routeRendererConsoleMessage(makeEvent({ level: 'warning', sourceId: '', lineNumber: 0 }), log);

    expect(log.warn).toHaveBeenCalledWith('[renderer] hello from renderer', '');
  });
});
