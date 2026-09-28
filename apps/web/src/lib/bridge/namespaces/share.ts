import {
  IPC_CHANNELS,
  SHARE_ERROR_CODES,
  shareImportResponseSchema,
  type ShareApi,
  type ShareCode,
  type ShareImportResponse,
} from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { logger } from '@/lib/logger';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { bareString } from '../narrowers';
import { asContract } from '../wire';

const C = IPC_CHANNELS.share;

/**
 * v1 validated the share server's response in the main process and the preload
 * handed the renderer a fully-typed discriminated union. D25 keeps the share
 * DTOs zod-only, so `share_import` returns `Json` on the wire and the typing
 * lands here instead — the schema is the same one both ends of the HTTP wire
 * already use, imported rather than restated.
 *
 * The Rust client bounds-checks the response before it gets here, so this is the
 * second of two gates rather than the only one. It still has to exist: a
 * `ShareImportResponse` is what 'the renderer reads field by field, and the shim
 * asserting a type it never checked is the lie the whole bridge is built to
 * avoid.
 *
 * A failure raises v1's error verbatim — same code, same message — because the
 * import UI matches on `SHARE_ERROR_CODES.INVALID_RESPONSE` and renders its own
 * translation of it.
 */
function typeImportResponse(raw: unknown): ShareImportResponse {
  const parsed = shareImportResponseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const error = new Error('Received invalid share data from the server') as Error & {
    code: string;
  };
  error.name = 'IpcError';
  error.code = SHARE_ERROR_CODES.INVALID_RESPONSE;
  throw error;
}

/**
 * The cold-start half of `share:deep-link`.
 *
 * A link that launches the app arrives before React has mounted the effect that
 * subscribes to the live event, so the backend holds it in a one-slot store
 * instead of emitting it into nothing. v1 dropped exactly that link. The shell
 * holds or emits, never both, so draining the slot once and listening to the
 * event covers every link exactly once.
 *
 * The drain lives here rather than in the hook because React `<StrictMode>`
 * subscribes, unsubscribes and subscribes again on mount. The take therefore
 * starts once per page load, at module scope, and its answer goes to the
 * first subscriber still subscribed when it resolves. One that left before
 * then never sees it; if none is left, the code waits for the next one.
 */
let drain: Promise<void> | undefined;
let heldCode: string | null = null;
const waiting = new Set<(code: string) => void>();

function startDrain(): Promise<void> {
  drain ??= commands.shareTakePendingDeepLink().then(
    code => {
      if (typeof code === 'string' && code.length > 0) heldCode = code;
    },
    (error: unknown) => {
      // A failed take costs the cold-start link and nothing else: the live
      // subscription is already in place and must keep working.
      logger.warn('[bridge] could not take the pending share deep link', error);
    }
  );
  return drain;
}

function deliverHeld(): void {
  if (heldCode === null) return;
  const first = waiting.values().next();
  if (first.done) return;
  const code = heldCode;
  heldCode = null;
  first.value(code);
}

export const shareApi: ShareApi = {
  track: trackId => asContract<ShareCode>(commands.shareTrack(trackId)),
  playlist: playlistId => asContract<ShareCode>(commands.sharePlaylist(playlistId)),
  import: async code => typeImportResponse(await commands.shareImport(code)),
  cacheYoutubeId: async (trackId, youtubeId) => {
    await commands.shareCacheYoutubeId(trackId, youtubeId);
  },
  onDeepLink: callback => {
    const unsubscribeLive = subscribeChannel<string>(
      C.deepLink,
      events.shareDeepLink,
      bareString,
      callback
    );

    // A wrapper per subscription, so the same callback subscribed twice is
    // still two entries and removing one leaves the other waiting.
    const receiver = (code: string) => callback(code);
    waiting.add(receiver);
    void startDrain().then(deliverHeld);

    return () => {
      waiting.delete(receiver);
      unsubscribeLive();
    };
  },
};
