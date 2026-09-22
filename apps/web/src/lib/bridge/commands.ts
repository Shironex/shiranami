/**
 * The generated command surface, with D9 rehydration and §2.4's art rewrite
 * applied once.
 *
 * Every namespace module imports `commands` from here rather than from
 * `@shiranami/contracts/bindings`, so there is no way to reach a raw generated
 * callable from the shim and accidentally leak an un-rehydrated rejection or an
 * unroutable `shiranami-art://` URL.
 *
 * The two wrappers compose in this order deliberately. Rehydration is innermost
 * so the rewriter only ever sees a resolved value — a rejection passes it
 * untouched — and `serve_info` is called on the rehydrated-but-not-rewritten
 * surface, because the rewriter waits on the very answer that call produces.
 */

import { commands as generated } from '@shiranami/contracts/bindings';
import { withRehydratedRejections } from './errors';
import { initStreamUrls, withRewrittenArtUrls } from './stream-urls';

const rehydrated = withRehydratedRejections(generated);

// Fired at module evaluation, which is bridge-install time: `install.ts` reaches
// this module through `./index`, so the request is in flight before React mounts
// and every later command result awaits it. A no-op outside the Tauri webview.
initStreamUrls(() => rehydrated.serveInfo());

export const commands = withRewrittenArtUrls(rehydrated);
