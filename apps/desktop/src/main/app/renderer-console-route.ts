/**
 * Pure routing logic for the renderer `console-message` event. Lives in its
 * own module so unit tests can import it without dragging in the full
 * `window.ts` graph (BrowserWindow, IPC handlers, electron-updater, etc.).
 *
 * Electron 35 changed the runtime payload for `console-message` from the
 * positional `(event, level, message, line, sourceId)` form to a single
 * details event with named properties on it. The type definitions still keep
 * the deprecated positional args for backwards compatibility, but they are
 * `undefined` at runtime starting in Electron 35.
 */

export type RendererConsoleLevel = 'info' | 'warning' | 'error' | 'debug';

export interface RendererConsoleEvent {
  level: RendererConsoleLevel;
  message: string;
  lineNumber: number;
  sourceId: string;
}

export interface RendererConsoleLogger {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const RENDERER_CONSOLE_NOISY_PATTERNS = [
  'MediaImage src can only be of', // Known Chromium limitation with custom protocols
  'Electron Security Warning', // Dev-only CSP warning
  '[vite]', // Vite HMR messages (dev-only noise)
  'Download the React DevTools', // React dev tools promo
  'i18next is made possible', // i18next promo
];

/**
 * Routes a renderer `console-message` event to the main-process logger.
 * Drops info/debug entries and known noisy patterns; forwards warnings to
 * `log.warn` and errors to `log.error` with a `sourceId:lineNumber` suffix.
 */
export function routeRendererConsoleMessage(
  event: RendererConsoleEvent,
  log: RendererConsoleLogger
): void {
  const { level, message, lineNumber, sourceId } = event;
  if (level === 'info' || level === 'debug') return;
  if (RENDERER_CONSOLE_NOISY_PATTERNS.some(p => message.includes(p))) return;

  const source = sourceId ? `${sourceId}:${lineNumber}` : '';
  if (level === 'error') {
    log.error(`[renderer] ${message}`, source);
  } else {
    log.warn(`[renderer] ${message}`, source);
  }
}
