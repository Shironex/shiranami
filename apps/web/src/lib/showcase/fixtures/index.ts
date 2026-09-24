/**
 * The showcase fixture module: loaded by `../install` through a dynamic import,
 * and only once a page opened with `?showcase=1` first calls the API.
 */

export const api: Record<string, unknown> = {};

/** Showcase mode is offline: every cross-origin request is refused. */
export async function respond(url: URL): Promise<Response> {
  throw new TypeError(`showcase mode is offline: blocked ${url.href}`);
}
