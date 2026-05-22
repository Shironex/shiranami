/**
 * Privacy scrubbing for Sentry events and breadcrumbs.
 *
 * Electron stack frames and log breadcrumbs carry absolute filesystem paths
 * that embed the OS username (`/Users/<name>/…`, `C:\Users\<name>\…`,
 * `/home/<name>/…`). Shipping those to a third-party sink would leak PII the
 * user did not knowingly consent to share. These helpers redact home-dir
 * prefixes from every place a path can appear before the event leaves the
 * machine.
 *
 * This module is intentionally dependency-free (no `@sentry/*` imports) so
 * both the main and renderer processes can import it. The Sentry shapes below
 * are structurally typed against the parts we touch — passing a real
 * `ErrorEvent`/`Breadcrumb` is accepted because the runtime payload matches.
 */

interface ScrubbableFrame {
  filename?: string;
  abs_path?: string;
  module?: string;
  [key: string]: unknown;
}

interface ScrubbableException {
  value?: string;
  stacktrace?: { frames?: ScrubbableFrame[] };
  [key: string]: unknown;
}

interface ScrubbableEvent {
  message?: string;
  exception?: { values?: ScrubbableException[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
  [key: string]: unknown;
}

interface ScrubbableBreadcrumb {
  message?: string;
  category?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Matches a Unix or Windows home-directory prefix and captures the segment
 * that follows it (the rest of the path). The username is the wildcard
 * between the home root and the next separator; we drop it entirely.
 *
 *   /Users/alice/Music/x.flac   → ~/Music/x.flac
 *   /home/alice/code/app.js     → ~/code/app.js
 *   C:\Users\alice\AppData\x    → ~\AppData\x
 */
const HOME_DIR_PATTERN =
  /(?:\/Users\/[^/\\]+|\/home\/[^/\\]+|[A-Za-z]:\\Users\\[^\\/]+)([/\\][^\s'"]*)?/g;

/** Replace every home-dir path in a string with a `~`-rooted, username-free path. */
export function scrubPath(input: string): string {
  return input.replace(HOME_DIR_PATTERN, (_match, rest: string | undefined) =>
    rest ? `~${rest}` : '~'
  );
}

/** Returns true when a string contains an absolute home-dir path. */
export function containsHomePath(input: string): boolean {
  HOME_DIR_PATTERN.lastIndex = 0;
  return HOME_DIR_PATTERN.test(input);
}

function scrubFrame(frame: ScrubbableFrame): ScrubbableFrame {
  if (typeof frame.filename === 'string') frame.filename = scrubPath(frame.filename);
  if (typeof frame.abs_path === 'string') frame.abs_path = scrubPath(frame.abs_path);
  if (typeof frame.module === 'string') frame.module = scrubPath(frame.module);
  return frame;
}

/**
 * `beforeSend` hook — strip home-dir paths from the event message and every
 * exception stack frame (filename/abs_path/module) plus any embedded
 * breadcrumb messages. Mutates and returns the event (Sentry expects the
 * scrubbed event back, or `null` to drop it — we never drop).
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === 'string') {
    event.message = scrubPath(event.message);
  }

  const values = event.exception?.values;
  if (Array.isArray(values)) {
    for (const exception of values) {
      if (typeof exception.value === 'string') {
        exception.value = scrubPath(exception.value);
      }
      const frames = exception.stacktrace?.frames;
      if (Array.isArray(frames)) {
        for (const frame of frames) scrubFrame(frame);
      }
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is ScrubbableBreadcrumb => b !== null);
  }

  return event;
}

/**
 * `beforeBreadcrumb` hook — drop console breadcrumbs that contain an absolute
 * home-dir path (they tend to echo our own file-path-laden log lines), and
 * scrub the path out of any breadcrumb that survives. Returns `null` to drop.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T | null {
  if (
    crumb.category === 'console' &&
    typeof crumb.message === 'string' &&
    containsHomePath(crumb.message)
  ) {
    return null;
  }

  if (typeof crumb.message === 'string') {
    crumb.message = scrubPath(crumb.message);
  }

  if (crumb.data && typeof crumb.data === 'object') {
    for (const [key, value] of Object.entries(crumb.data)) {
      if (typeof value === 'string') {
        crumb.data[key] = scrubPath(value);
      }
    }
  }

  return crumb;
}
