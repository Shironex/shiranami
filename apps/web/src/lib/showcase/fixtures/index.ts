/**
 * The showcase fixture module: loaded by `../install` through a dynamic import,
 * and only once a page opened with `?showcase=1` first calls the API.
 */

import { createShowcaseApi } from './api';
import { installShowcasePlayback } from './playback';
import { installShowcaseRadio } from './radio';

installShowcaseRadio();
installShowcasePlayback();

export const api = createShowcaseApi() as Record<string, unknown>;

/** Showcase mode is offline: every cross-origin request is refused. */
export async function respond(url: URL): Promise<Response> {
  throw new TypeError(`showcase mode is offline: blocked ${url.href}`);
}
