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
 * The functions are generic over the caller's exact type (Sentry's
 * `ErrorEvent`/`Breadcrumb`) — they mutate in place and return the same object
 * so `beforeSend`/`beforeBreadcrumb` get back a value of the type Sentry
 * expects. Internally they read fields through loose views so the module stays
 * dependency-free (no `@sentry/*` imports) and importable by both processes.
 */

interface FrameView {
  filename?: unknown;
  abs_path?: unknown;
  module?: unknown;
}

interface ExceptionView {
  value?: unknown;
  stacktrace?: { frames?: FrameView[] } | null;
}

interface EventView {
  message?: unknown;
  exception?: { values?: ExceptionView[] } | null;
  breadcrumbs?: BreadcrumbView[] | null;
}

interface BreadcrumbView {
  message?: unknown;
  category?: unknown;
  data?: Record<string, unknown> | null;
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

function scrubFrame(frame: FrameView): void {
  if (typeof frame.filename === 'string') frame.filename = scrubPath(frame.filename);
  if (typeof frame.abs_path === 'string') frame.abs_path = scrubPath(frame.abs_path);
  if (typeof frame.module === 'string') frame.module = scrubPath(frame.module);
}

/**
 * `beforeSend` hook — strip home-dir paths from the event message and every
 * exception stack frame (filename/abs_path/module) plus any embedded
 * breadcrumb messages. Mutates and returns the event (Sentry expects the
 * scrubbed event back, or `null` to drop it — we never drop).
 */
export function scrubEvent<T>(event: T): T {
  const view = event as EventView;

  if (typeof view.message === 'string') {
    view.message = scrubPath(view.message);
  }

  const values = view.exception?.values;
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

  if (Array.isArray(view.breadcrumbs)) {
    view.breadcrumbs = view.breadcrumbs.filter(crumb => scrubBreadcrumb(crumb) !== null);
  }

  return event;
}

/**
 * `beforeBreadcrumb` hook — drop console breadcrumbs that contain an absolute
 * home-dir path (they tend to echo our own file-path-laden log lines), and
 * scrub the path out of any breadcrumb that survives. Returns `null` to drop.
 */
export function scrubBreadcrumb<T>(crumb: T): T | null {
  const view = crumb as BreadcrumbView;

  if (
    view.category === 'console' &&
    typeof view.message === 'string' &&
    containsHomePath(view.message)
  ) {
    return null;
  }

  if (typeof view.message === 'string') {
    view.message = scrubPath(view.message);
  }

  if (view.data && typeof view.data === 'object') {
    for (const [key, value] of Object.entries(view.data)) {
      if (typeof value === 'string') {
        view.data[key] = scrubPath(value);
      }
    }
  }

  return crumb;
}
