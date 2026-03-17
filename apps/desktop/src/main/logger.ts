import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  LOG_FILE_PREFIX,
  LOG_MAX_FILE_SIZE,
  LOG_MAX_AGE_MS,
  LOG_FLUSH_INTERVAL_MS,
  LOG_BUFFER_MAX_ENTRIES,
  LOG_CLEANUP_INTERVAL_MS,
  createLogger,
  LoggerOptions,
  setTimestampsEnabled,
} from '@shiranami/shared';

let logsDir: string | null = null;
const buffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let isRotating = false;
let loggingFailed = false;
let loggingErrorNotified = false;

export function getLogsDir(): string {
  if (!logsDir) {
    const userDataPath = app.getPath('userData');
    logsDir = path.join(userDataPath, 'logs');
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

export function getLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(getLogsDir(), `${LOG_FILE_PREFIX}-${date}.log`);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getNextRotationNumber(dir: string, baseName: string): Promise<number> {
  const files = await fs.promises.readdir(dir);
  let max = 0;
  const pattern = new RegExp(`^${escapeRegex(baseName)}\\.(\\d+)\\.log$`);
  for (const file of files) {
    const match = file.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

async function rotateIfNeeded(currentPath: string): Promise<void> {
  if (isRotating) return;
  isRotating = true;
  try {
    const stat = await fs.promises.stat(currentPath);
    if (stat.size < LOG_MAX_FILE_SIZE) return;
    const dir = path.dirname(currentPath);
    const ext = path.extname(currentPath);
    const base = path.basename(currentPath, ext);
    const n = await getNextRotationNumber(dir, base);
    const rotatedPath = path.join(dir, `${base}.${n}${ext}`);
    await fs.promises.rename(currentPath, rotatedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      handleLoggingError(error);
    }
  } finally {
    isRotating = false;
  }
}

async function cleanupOldLogs(): Promise<void> {
  try {
    const dir = getLogsDir();
    const files = await fs.promises.readdir(dir);
    const now = Date.now();
    for (const file of files) {
      if (!file.startsWith(LOG_FILE_PREFIX) || !file.endsWith('.log')) continue;
      const filePath = path.join(dir, file);
      try {
        const stat = await fs.promises.stat(filePath);
        if (now - stat.mtimeMs > LOG_MAX_AGE_MS) {
          await fs.promises.unlink(filePath);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

async function doFlush(): Promise<void> {
  if (buffer.length === 0 || loggingFailed) return;
  const entries = buffer.splice(0);
  const logPath = getLogPath();
  try {
    await rotateIfNeeded(logPath);
    await fs.promises.appendFile(logPath, entries.join(''));
  } catch (error) {
    buffer.unshift(...entries);
    handleLoggingError(error);
  }
}

export async function flushLogs(): Promise<void> {
  await doFlush();
}

function handleLoggingError(error: unknown): void {
  if (!loggingErrorNotified) {
    loggingErrorNotified = true;
    console.error('[Logger] File logging failed:', error);
  }
  loggingFailed = true;
}

export const fileTransport = (message: string): void => {
  if (loggingFailed) return;
  buffer.push(message);
  if (buffer.length >= LOG_BUFFER_MAX_ENTRIES) {
    doFlush().catch(() => {});
  }
};

function initialize(): void {
  try {
    getLogsDir();
  } catch (error) {
    handleLoggingError(error);
    return;
  }

  flushTimer = setInterval(() => {
    doFlush().catch(() => {});
  }, LOG_FLUSH_INTERVAL_MS);

  cleanupOldLogs();

  cleanupTimer = setInterval(() => {
    cleanupOldLogs();
  }, LOG_CLEANUP_INTERVAL_MS);

  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

initialize();

setTimestampsEnabled(true);

const loggerOptions: LoggerOptions = { fileTransport };

export const logger = createLogger('Main', loggerOptions);
export default logger;
