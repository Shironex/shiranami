import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockExit = vi.fn();
const mockShowMessageBox = vi.fn();
const mockOpenPath = vi.fn();

vi.mock('electron', () => ({
  app: {
    exit: (...args: unknown[]) => mockExit(...args),
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => mockShowMessageBox(...args),
  },
  shell: {
    openPath: (...args: unknown[]) => mockOpenPath(...args),
  },
}));

const mockFlushLogs = vi.fn();
const mockGetLogsDir = vi.fn(() => 'C:\\logs');
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  flushLogs: (...args: unknown[]) => mockFlushLogs(...args),
  getLogsDir: (...args: unknown[]) => mockGetLogsDir(...args),
}));

const mockCaptureException = vi.fn();
const mockSentryFlush = vi.fn();
vi.mock('@sentry/electron/main', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  flush: (...args: unknown[]) => mockSentryFlush(...args),
}));

const { reportBootFailure } = await import('./boot-failure');

describe('reportBootFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlushLogs.mockResolvedValue(undefined);
    mockSentryFlush.mockResolvedValue(true);
    mockOpenPath.mockResolvedValue('');
    mockShowMessageBox.mockResolvedValue({ response: 1 }); // default: Quit
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('captures the error to Sentry and exits with code 1', async () => {
    const err = new Error('Database schema version 8 is newer than this app supports (7).');
    await reportBootFailure(err);

    expect(mockCaptureException).toHaveBeenCalledWith(err);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('flushes logs AND Sentry before exiting so nothing is lost on a fast crash', async () => {
    const order: string[] = [];
    mockFlushLogs.mockImplementation(() => {
      order.push('flushLogs');
      return Promise.resolve();
    });
    mockSentryFlush.mockImplementation(() => {
      order.push('sentryFlush');
      return Promise.resolve(true);
    });
    mockExit.mockImplementation(() => {
      order.push('exit');
    });

    await reportBootFailure(new Error('boom'));

    expect(order.indexOf('flushLogs')).toBeLessThan(order.indexOf('exit'));
    expect(order.indexOf('sentryFlush')).toBeLessThan(order.indexOf('exit'));
  });

  it('surfaces a native dialog with an Open Logs Folder affordance', async () => {
    await reportBootFailure(new Error('boom'));

    expect(mockShowMessageBox).toHaveBeenCalledTimes(1);
    const opts = mockShowMessageBox.mock.calls[0][0] as Electron.MessageBoxOptions;
    expect(opts.type).toBe('error');
    expect(opts.buttons).toEqual(['Open Logs Folder', 'Quit']);
    expect(opts.detail).toContain('boom');
  });

  it('opens the logs folder when the user picks that button', async () => {
    mockShowMessageBox.mockResolvedValue({ response: 0 }); // Open Logs Folder
    await reportBootFailure(new Error('boom'));

    expect(mockOpenPath).toHaveBeenCalledWith('C:\\logs');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('does NOT open the logs folder when the user picks Quit', async () => {
    mockShowMessageBox.mockResolvedValue({ response: 1 });
    await reportBootFailure(new Error('boom'));

    expect(mockOpenPath).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('still exits when the dialog itself throws', async () => {
    mockShowMessageBox.mockRejectedValue(new Error('no display'));
    await reportBootFailure(new Error('boom'));

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('coerces non-Error throwables into the dialog detail', async () => {
    await reportBootFailure('plain string failure');

    const opts = mockShowMessageBox.mock.calls[0][0] as Electron.MessageBoxOptions;
    expect(opts.detail).toContain('plain string failure');
  });
});

describe('reportBootFailure under E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlushLogs.mockResolvedValue(undefined);
    mockSentryFlush.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('skips the modal and fails fast when SHIRANAMI_E2E=1', async () => {
    vi.stubEnv('SHIRANAMI_E2E', '1');
    vi.resetModules();
    const { reportBootFailure: e2eReport } = await import('./boot-failure');

    await e2eReport(new Error('boom'));

    expect(mockShowMessageBox).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
