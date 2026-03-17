/**
 * Universal logger for Shiranami
 *
 * Works across all environments:
 * - Electron main process (with optional file transport)
 * - React frontend (browser console with CSS badges)
 *
 * Environment Variables:
 * - LOG_LEVEL: error, warn, info, debug (default: info)
 * - LOG_COLORS: true/false (default: true in Node.js)
 * - LOG_TIMESTAMPS: true/false (default: false)
 */

enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

const LOG_LEVEL_NAMES: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const BROWSER_STYLES = {
  timestamp: 'color: #6b7280; font-size: 11px;',
  context: 'color: #3b82f6; font-weight: 600;',
  reset: 'color: inherit; font-weight: inherit;',
  levels: {
    ERROR:
      'background: #ef4444; color: white; font-weight: bold; padding: 1px 6px; border-radius: 3px;',
    WARN: 'background: #f59e0b; color: white; font-weight: bold; padding: 1px 6px; border-radius: 3px;',
    INFO: 'background: #3b82f6; color: white; font-weight: bold; padding: 1px 6px; border-radius: 3px;',
    DEBUG:
      'background: #8b5cf6; color: white; font-weight: bold; padding: 1px 6px; border-radius: 3px;',
  },
};

const isBrowser = typeof (globalThis as Record<string, unknown>).window !== 'undefined';

let currentLogLevel: LogLevel = LogLevel.INFO;

function getEnvVar(name: string): string | undefined {
  if (isBrowser) return undefined;
  try {
    return process?.env?.[name];
  } catch {
    return undefined;
  }
}

const colorsEnabled = !isBrowser && getEnvVar('LOG_COLORS') !== 'false';
let timestampsEnabled = getEnvVar('LOG_TIMESTAMPS') === 'true';

const envLogLevel = getEnvVar('LOG_LEVEL')?.toLowerCase();
if (envLogLevel && LOG_LEVEL_NAMES[envLogLevel] !== undefined) {
  currentLogLevel = LOG_LEVEL_NAMES[envLogLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatShortTime(): string {
  return new Date().toISOString().split('T')[1].slice(0, 12);
}

function formatNodeLog(level: string, context: string, levelColor: string): string {
  const parts: string[] = [];
  if (timestampsEnabled) {
    parts.push(colorsEnabled ? `${ANSI.gray}${formatTimestamp()}${ANSI.reset}` : formatTimestamp());
  }
  const levelPadded = level.padEnd(5);
  parts.push(colorsEnabled ? `${levelColor}${levelPadded}${ANSI.reset}` : levelPadded);
  parts.push(colorsEnabled ? `${ANSI.blue}[${context}]${ANSI.reset}` : `[${context}]`);
  return parts.join(' ');
}

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  context: string;
  message: string;
  data?: unknown;
}

function formatFileLog(level: string, context: string, args: unknown[]): string {
  try {
    const firstArg = args.length > 0 ? args[0] : '';
    const message = typeof firstArg === 'string' ? firstArg : JSON.stringify(firstArg);
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: level.toLowerCase() as LogEntry['level'],
      context,
      message,
    };
    if (args.length > 1) {
      entry.data = args.length === 2 ? args[1] : args.slice(1);
    }
    return JSON.stringify(entry) + '\n';
  } catch {
    return (
      JSON.stringify({
        timestamp: formatTimestamp(),
        level: level.toLowerCase(),
        context,
        message: String(args),
      }) + '\n'
    );
  }
}

export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
}

export interface LoggerOptions {
  useStderr?: boolean;
  fileTransport?: (message: string) => void;
}

export function createLogger(context: string, options?: LoggerOptions): Logger {
  const useStderr = options?.useStderr ?? false;
  const fileTransport = options?.fileTransport;

  if (isBrowser) {
    return {
      error: (...args: unknown[]): void => {
        if (currentLogLevel >= LogLevel.ERROR) {
          console.error(
            `%cERROR%c %c${formatShortTime()}%c %c[${context}]%c`,
            BROWSER_STYLES.levels.ERROR,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.timestamp,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.context,
            BROWSER_STYLES.reset,
            ...args
          );
        }
      },
      warn: (...args: unknown[]): void => {
        if (currentLogLevel >= LogLevel.WARN) {
          console.warn(
            `%cWARN%c %c${formatShortTime()}%c %c[${context}]%c`,
            BROWSER_STYLES.levels.WARN,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.timestamp,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.context,
            BROWSER_STYLES.reset,
            ...args
          );
        }
      },
      info: (...args: unknown[]): void => {
        if (currentLogLevel >= LogLevel.INFO) {
          console.log(
            `%cINFO%c %c${formatShortTime()}%c %c[${context}]%c`,
            BROWSER_STYLES.levels.INFO,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.timestamp,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.context,
            BROWSER_STYLES.reset,
            ...args
          );
        }
      },
      debug: (...args: unknown[]): void => {
        if (currentLogLevel >= LogLevel.DEBUG) {
          console.log(
            `%cDEBUG%c %c${formatShortTime()}%c %c[${context}]%c`,
            BROWSER_STYLES.levels.DEBUG,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.timestamp,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.context,
            BROWSER_STYLES.reset,
            ...args
          );
        }
      },
      log: (...args: unknown[]): void => {
        if (currentLogLevel >= LogLevel.INFO) {
          console.log(
            `%cINFO%c %c${formatShortTime()}%c %c[${context}]%c`,
            BROWSER_STYLES.levels.INFO,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.timestamp,
            BROWSER_STYLES.reset,
            BROWSER_STYLES.context,
            BROWSER_STYLES.reset,
            ...args
          );
        }
      },
    };
  }

  const output = useStderr ? console.error : console.log;
  const errorOutput = console.error;

  return {
    error: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.ERROR) {
        errorOutput(formatNodeLog('ERROR', context, ANSI.red), ...args);
        if (fileTransport) fileTransport(formatFileLog('ERROR', context, args));
      }
    },
    warn: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.WARN) {
        output(formatNodeLog('WARN', context, ANSI.yellow), ...args);
        if (fileTransport) fileTransport(formatFileLog('WARN', context, args));
      }
    },
    info: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.INFO) {
        output(formatNodeLog('INFO', context, ANSI.cyan), ...args);
        if (fileTransport) fileTransport(formatFileLog('INFO', context, args));
      }
    },
    debug: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.DEBUG) {
        output(formatNodeLog('DEBUG', context, ANSI.magenta), ...args);
        if (fileTransport) fileTransport(formatFileLog('DEBUG', context, args));
      }
    },
    log: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.INFO) {
        output(formatNodeLog('INFO', context, ANSI.cyan), ...args);
        if (fileTransport) fileTransport(formatFileLog('INFO', context, args));
      }
    },
  };
}

export function setTimestampsEnabled(enabled: boolean): void {
  timestampsEnabled = enabled;
}
