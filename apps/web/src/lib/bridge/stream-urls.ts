/**
 * §2.4's URL builder: v1's custom media schemes, rewritten onto the loopback
 * server.
 *
 * v1 served audio, album art and the radio proxy from three custom URI schemes
 * registered by the Electron main process. §2.4 replaces all three with one
 * loopback HTTP server, because macOS 26.6 stopped delivering cross-scheme
 * subresource requests to `WKURLSchemeHandler` (wry#1778) — a page on
 * `tauri://localhost` referencing `shiranami-art://` never reaches a handler at
 * all. The route table is `shiranami-serve`'s own:
 *
 * | v1                                    | v2                              |
 * | ------------------------------------- | ------------------------------- |
 * | `shiranami-audio://play?path=…`       | `GET {base}/audio?path=…`       |
 * | `shiranami-art://art/{hash}.jpg`      | `GET {base}/art/{hash}.jpg`     |
 * | `shiranami-radio://stream?url=…`      | `GET {base}/radio?url=…`        |
 *
 * where `base` is `http://127.0.0.1:{port}/{token}` — an ephemeral port and a
 * per-session credential, so it cannot be a constant and has to be fetched.
 *
 * # Why the art rewrite happens here rather than at the `<img>` tags
 *
 * `tracks.album_art` holds a `shiranami-art://` string *in the database*, and
 * §3.3 deliberately does not rewrite it during migration — the cache is
 * content-addressed and re-hashing 500 covers to change a URL prefix would be
 * work for nothing. So the v1 scheme is what every row carries, and it arrives
 * on roughly two dozen commands (`db_tracks_*`, `db_playlists_get_tracks`,
 * `db_history_*`, `library_scan_*`, `metadata_enrich_*`, `recommendations_*`).
 *
 * Rewriting at the consumers would mean touching every one of them, and there
 * are more than they look: `TrackThumbnail` funnels a dozen call sites, but
 * eight further components build a raw `<img src>` themselves, `useAmbientColor`
 * feeds the URL to a canvas, `useMediaSession` hands it to the OS, and
 * `PlaylistDetailHeader` reads `playlist.coverArt` — a *different field* that
 * holds the same scheme. `EnrichLastRunPanel` renders `String(diff.newValue)`,
 * an art URL inside an untyped diff, which no field-name-based rewrite would
 * ever find.
 *
 * So the rewrite is by **value, not by field name**, applied once to every
 * command result at the bridge chokepoint. A string that begins with the v1 art
 * prefix is a v1 art URL wherever it appears, and the renderer never learns the
 * scheme changed.
 *
 * # And the same chokepoint has to run in reverse, on the way in
 *
 * The rewrite was first shipped as outbound-only, on the reasoning that nothing
 * sends art URLs back. Two paths do, both by design:
 *
 * - `useMetadataEnrichStore.applyEnrichResults` reads `updatedFields.albumArt`
 *   off an enrich result and posts it straight into `db:tracks:update-many`.
 * - `scanHelpers.scanAndPersistFolder` reads `metadata.albumArt` off a scan
 *   result and posts it into `db:tracks:add-many`.
 *
 * — plus "use this track's cover" on a playlist, which copies the same string
 * into `playlists.cover_art`. Every one of them stored `http://127.0.0.1:{port}
 * /{token}/art/…`: an address whose port and token die with the process. Those
 * rows were `ECONNREFUSED` on the next launch, and — because the album-art
 * prune recognises only the `shiranami-art://` form — a database full of them
 * read as *nothing is referenced*, so the boot prune deleted the whole cover
 * cache.
 *
 * [`toStoredArtUrl`] is the inverse, applied to every command's **arguments**
 * at this same chokepoint. Symmetry is the point: a rewrite that only goes one
 * way is a rewrite that leaks its session into the database, and a hand-kept
 * list of the commands that accept art would drift exactly as a hand-kept list
 * of the ones that return it would. `shiranami-db` refuses a non-canonical
 * value independently, and migration `0007` repairs the rows already written;
 * this is the half that stops producing them.
 *
 * One namespace is exempt, and for a reason that is the mirror image of the
 * rule: `media_playback_state` hands the cover to the OS, which can only load
 * an `http` URL. There the loopback form *is* the value that was wanted. See
 * `keepsLoopbackArt`.
 *
 * # Why audio is a function the renderer calls instead
 *
 * The audio URL is not stored anywhere — it is derived from `track.filePath` at
 * the moment a deck loads. There is no bridge crossing to intercept, and
 * rewriting `filePath` itself would be wrong: it is a real path, used for
 * containment checks, metadata writes and "show in folder". §2.4's renderer row
 * anticipates exactly this and scopes it to "one URL-builder helper … the URL is
 * constructed in a single place today". [`toStreamUrl`] is that helper, and
 * `getTrackSrc` in `useAudioEngine` is that single place.
 *
 * # Outside Tauri every function here is the identity
 *
 * Browser dev, Storybook and vitest have no server to address, and their
 * fixtures assert on the v1 strings. [`initStreamUrls`] is a no-op when the
 * webview is absent, which leaves the base `null`, which makes the rewriter
 * return its input and [`toStreamUrl`] emit exactly the URL v1 emitted.
 */

import { logger } from '@/lib/logger';
import { isTauri } from './environment';

/** v1's album-art prefix, as `shiranami-metadata` writes it into the database. */
const ART_PREFIX = 'shiranami-art://art/';

/**
 * A loopback media-server art URL, in any session's spelling.
 *
 * Matched on the *shape* rather than against the live [`base`], so a value that
 * survived a restart — a persisted queue entry, a React Query cache rehydrated
 * from an earlier run — is repaired too, and so the inverse still works in the
 * degraded state where the shell never answered and the base is `null`.
 *
 * Deliberately strict where {@link toArtUrl} is permissive: exactly one token
 * segment, one path component for the file name, and nothing but a query or
 * fragment after it. The rewrite is the app's own output, so anything else was
 * not produced here and is not this function's to reshape. Kept in step with
 * `shiranami_core::art::loopback_art_file_name`, which a Rust test pins against
 * the same corpus.
 */
const LOOPBACK_ART = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/[^/]+\/art\/([^/?#]+)/;

/** v1's radio prefix. The stream URL follows as an encoded `url` parameter. */
const RADIO_PREFIX = 'shiranami-radio://stream?url=';

/** Any radio URL, including shapes older than the one above. */
const RADIO_SCHEME = 'shiranami-radio://';

/**
 * `http://127.0.0.1:{port}/{token}`, or `null` until the shell has answered.
 *
 * Module-scoped rather than passed around because the alternative is threading a
 * base URL through 24 namespace modules and the audio engine, all of which want
 * the same one value for the life of the process.
 */
let base: string | null = null;

/** Resolves once the base is known, or immediately when there is none to know. */
let ready: Promise<void> | null = null;

/** What `serve_info` answers with. */
interface ServeInfo {
  origin: string;
  token: string;
}

/**
 * Ask the shell where the media server is, once, at bridge-install time.
 *
 * The fetcher is injected rather than imported so this module does not reach
 * back into `./commands` — that module wraps *this* one's rewriter around the
 * generated surface, and importing it here would be a cycle in which the
 * rewriter awaits a promise that its own chokepoint is waiting to create.
 *
 * A failure is logged and left as "no base", which degrades to v1-scheme URLs
 * that resolve to nothing. That is the same visible outcome as the blocker this
 * closes, and it is the right one: inventing an origin would produce 404s that
 * look like missing files rather than a shell that failed to answer.
 */
export function initStreamUrls(fetchInfo: () => Promise<ServeInfo>): void {
  if (!isTauri()) {
    ready = null;
    return;
  }

  ready = fetchInfo()
    .then(info => {
      // Joined here and nowhere else, so the token exists as a standalone value
      // in exactly one expression. `shiranami-serve` pins this join against its
      // own `base_url`.
      base = `${info.origin}/${info.token}`;
    })
    .catch((error: unknown) => {
      logger.error('[bridge] the media server did not report its address', error);
    });
}

/**
 * Await the base URL, if one is coming.
 *
 * Every command result passes through here before its art URLs are rewritten,
 * which is what removes the race: React Query fires `db_tracks_get_all` as the
 * app mounts, and without the await that first library render would carry
 * un-rewritten URLs and paint a screen of placeholders that only a refetch would
 * correct.
 */
export async function whenStreamUrlsReady(): Promise<void> {
  if (ready !== null) await ready;
}

/** The base URL, for tests and diagnostics. `null` outside the webview. */
export function streamUrlBase(): string | null {
  return base;
}

/** Reset module state. Test-only — nothing in the app un-installs the bridge. */
export function resetStreamUrlsForTests(): void {
  base = null;
  ready = null;
}

/**
 * Rewrite one string if it is a v1 art URL, otherwise return it unchanged.
 *
 * Only the canonical `shiranami-art://art/` prefix is rewritten. The filename
 * that follows is passed through as-is: `shiranami-serve`'s `safe_name` refuses
 * a name containing a separator outright rather than sanitising it, so
 * forwarding the segment verbatim keeps a malformed value a 403 at the server
 * instead of silently reshaping it into a path that resolves.
 */
export function toArtUrl(value: string): string {
  if (base === null || !value.startsWith(ART_PREFIX)) return value;
  return `${base}/art/${value.slice(ART_PREFIX.length)}`;
}

/**
 * Rewrite one string back to the form the database holds, or return it
 * unchanged.
 *
 * The exact inverse of {@link toArtUrl}, and the only thing standing between a
 * renderer that round-trips a value it was shown and a row addressed by a dead
 * port. Anything that is not a loopback art URL — a `shiranami-art://` URL that
 * was never rewritten, a remote cover, a radio favicon, a `data:` URL — is
 * returned as it arrived.
 */
export function toStoredArtUrl(value: string): string {
  const match = LOOPBACK_ART.exec(value);
  if (match?.[1] === undefined) return value;
  return `${ART_PREFIX}${match[1]}`;
}

/**
 * Deep-rewrite every v1 art URL in a command result.
 *
 * Copy-on-change: a payload with no art in it is returned by reference, so the
 * common case allocates nothing and React Query's structural sharing is not
 * defeated by a wholesale clone on every fetch.
 *
 * Plain arrays and objects only. A `Date`, `Map` or class instance is left
 * alone — nothing crosses the IPC boundary as one, and walking into them would
 * risk rebuilding a value as a shape it was not.
 */
export function rewriteArtUrls<T>(value: T): T {
  if (base === null) return value;
  return walk(value, toArtUrl) as T;
}

/**
 * Deep-restore every loopback art URL in a command's arguments.
 *
 * The inbound counterpart of {@link rewriteArtUrls}, and unconditional: unlike
 * the outbound direction there is no base to wait for, and a value written
 * during a session whose server never answered would still be wrong.
 */
export function restoreArtUrls<T>(value: T): T {
  return walk(value, toStoredArtUrl) as T;
}

function walk(value: unknown, map: (value: string) => string): unknown {
  if (typeof value === 'string') return map(value);

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map(item => {
      const rewritten = walk(item, map);
      if (rewritten !== item) changed = true;
      return rewritten;
    });
    return changed ? next : value;
  }

  if (typeof value === 'object' && value !== null && isPlainObject(value)) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const rewritten = walk(item, map);
      if (rewritten !== item) changed = true;
      next[key] = rewritten;
    }
    return changed ? next : value;
  }

  return value;
}

/** Whether a value is an object literal, rather than an instance of something. */
function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * The URL a deck should load for a track: §2.4's one renderer-facing helper.
 *
 * Radio tracks carry their upstream URL inside `filePath` as
 * `shiranami-radio://stream?url=…`, written there by `stationToTrack` and by the
 * yt-dlp preview hook and then persisted into the queue. That stored string is
 * deliberately left in v1's shape — `isRadioTrack` pattern-matches the scheme in
 * eleven places — so the translation to a servable URL happens here, at the
 * moment of playback, and nowhere else.
 *
 * The encoded parameter is forwarded verbatim rather than decoded and
 * re-encoded. `encodeURIComponent` never emits a bare `+` or a space, and
 * `shiranami-serve` reads the query with `form_urlencoded` — which would decode
 * a `+` as a space — so passing the original bytes through is what keeps a
 * stream URL containing `+` addressable.
 */
export function toStreamUrl(filePath: string): string {
  if (filePath.startsWith(RADIO_SCHEME)) {
    if (base === null || !filePath.startsWith(RADIO_PREFIX)) return filePath;
    return `${base}/radio?url=${filePath.slice(RADIO_PREFIX.length)}`;
  }

  // Windows separators are normalised before encoding, as v1 did: the
  // containment guard compares forward-slash paths on every platform.
  const normalized = filePath.replace(/\\/g, '/');
  const encoded = encodeURIComponent(normalized);

  if (base === null) return `shiranami-audio://play?path=${encoded}`;
  return `${base}/audio?path=${encoded}`;
}

/**
 * The one namespace whose arguments keep the loopback URL.
 *
 * `media_playback_state` hands the cover to the **operating system**, not to
 * storage: `shiranami-media-controls` accepts only `http`/`https` (souvlaki
 * cannot load a custom scheme, and its macOS loader aborts the process on a
 * cover it fails to read), and it resolves `{origin}/{token}/art/{name}` back
 * to the cache file that name addresses. So this argument is an *outbound*
 * value that happens to travel inward, and restoring it would put OS media
 * controls back to the coverless state §2.4 left them in.
 *
 * A namespace prefix rather than a list of command names, because the property
 * that earns the exemption is "it addresses the OS", which is what the whole
 * namespace does — a `media_*` command added tomorrow inherits it correctly,
 * where a name list would have to be remembered.
 */
const OS_FACING_NAMESPACE = /^media[A-Z]/;

/** Whether a command's arguments are consumed by the OS rather than stored. */
function keepsLoopbackArt(property: PropertyKey): boolean {
  return typeof property === 'string' && OS_FACING_NAMESPACE.test(property);
}

/**
 * Wrap a generated binding object so art URLs are rewritten on the way out and
 * restored on the way in.
 *
 * The same proxy shape as `withRehydratedRejections`, and for the same stated
 * reason: a chokepoint cannot drift, where a hand-maintained list of the
 * ~24 art-bearing commands would — and would need editing again every time a
 * command starts returning a track.
 *
 * The argument pass runs *before* the call rather than after the result, so a
 * command that both accepts and returns a track (`db:tracks:update` does) sees
 * a canonical value going in and the caller still gets a displayable one back.
 * The exception is [`keepsLoopbackArt`], the one place where the loopback URL
 * is the value that was wanted.
 */
export function withRewrittenArtUrls<T extends object>(source: T): T {
  const wrapped = new Map<PropertyKey, unknown>();

  return new Proxy(source, {
    get(target, property, receiver): unknown {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;

      const cached = wrapped.get(property);
      if (cached !== undefined) return cached;

      const call = value as (...args: unknown[]) => Promise<unknown>;
      const restore = !keepsLoopbackArt(property);
      const rewriting = async (...args: unknown[]): Promise<unknown> => {
        const result = await call.apply(target, restore ? restoreArtUrls(args) : args);
        await whenStreamUrlsReady();
        return rewriteArtUrls(result);
      };

      wrapped.set(property, rewriting);
      return rewriting;
    },
  });
}
