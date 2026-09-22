import {
  IPC_CHANNELS,
  SHARE_ERROR_CODES,
  shareImportResponseSchema,
  type ShareApi,
  type ShareCode,
  type ShareImportResponse,
} from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
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

export const shareApi: ShareApi = {
  track: trackId => asContract<ShareCode>(commands.shareTrack(trackId)),
  playlist: playlistId => asContract<ShareCode>(commands.sharePlaylist(playlistId)),
  import: async code => typeImportResponse(await commands.shareImport(code)),
  cacheYoutubeId: async (trackId, youtubeId) => {
    await commands.shareCacheYoutubeId(trackId, youtubeId);
  },
  onDeepLink: callback =>
    subscribeChannel<string>(C.deepLink, events.shareDeepLink, bareString, callback),
};
