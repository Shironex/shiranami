/** Application name (display) */
export const APP_NAME = 'Shiranami';

/** Localhost address */
export const LOCALHOST = '127.0.0.1';

/** Vite dev server port */
export const VITE_DEV_PORT = 15175;

/** Log file prefix */
export const LOG_FILE_PREFIX = 'shiranami';

/** Maximum log file size before rotation (10MB) */
export const LOG_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum age of log files before cleanup (7 days in ms) */
export const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Log flush interval in milliseconds */
export const LOG_FLUSH_INTERVAL_MS = 100;

/** Maximum buffered log entries before forced flush */
export const LOG_BUFFER_MAX_ENTRIES = 50;

/** Log cleanup interval (1 hour in ms) */
export const LOG_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
