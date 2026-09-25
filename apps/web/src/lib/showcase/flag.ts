/**
 * Showcase mode: the web build served from fixed demo data instead of a backend,
 * for README and portfolio screenshots (`showcase.config.mjs` at the repo root).
 *
 * It is on only when a dev build is opened with `?showcase=1`. The URL is the
 * whole switch on purpose: nothing is persisted, so a regular dev profile can
 * never wake up in showcase mode, and closing the tab is the way out.
 */

/** The query parameter that turns showcase mode on, as `?showcase=1`. */
export const SHOWCASE_PARAM = 'showcase';

/** Whether this page load asked for showcase mode. */
export function isShowcaseRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(SHOWCASE_PARAM) === '1';
}
