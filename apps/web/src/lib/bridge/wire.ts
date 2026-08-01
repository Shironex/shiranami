/**
 * The one place the wire's vocabulary of absence is reconciled with v1's.
 *
 * Rust has a single way to say "nothing" and it serialises to `null`. v1's
 * hand-written contract in `packages/contracts` says it two ways — an omitted
 * optional property, and `undefined` — and the renderer was written against
 * that. Every one of the 38 places the generated types and the contract
 * disagree is this disagreement and nothing else. Two kinds, resolved
 * differently because only one of them is real at runtime:
 *
 * # A returned `null` where v1 returned `undefined` — {@link orUndefined}
 *
 * `db:tracks:add` resolved `undefined` when the row already existed;
 * `db_tracks_add` resolves `null`. That is a **different value reaching the
 * renderer**, so it is converted rather than asserted away. Eleven channels:
 * the four `db:tracks` upserts, the two `db:folders` writes, the four
 * `db:playlists` writes, and nothing else — every one a handler whose own
 * return value changed, not a field inside a payload.
 *
 * # A `null` *inside* a payload — {@link asContract}
 *
 * `Playlist.description` is typed `string | undefined` by the contract and
 * `string | null` by the bindings. v1 did **not** send `undefined` here: the
 * value came off a drizzle row where the column is nullable, so v1 sent `null`
 * too and its type was simply optimistic about it. Rewriting these at runtime
 * would change values v1 also sent, walk every payload to do it, and — for
 * `Track`, where `artist: string | null` is in *both* types — be unable to tell
 * the two apart. So the shapes are the same and the assertion says so.
 *
 * `scrobble:{lastfm-complete-auth,listenbrainz-connect,lastfm-begin-auth}` are
 * the same kind with one extra wrinkle: the contract is a union discriminated
 * on `ok` and the binding is a flat struct, because Rust has no untagged
 * boolean-discriminated union. A success still carries `username` and a failure
 * still carries `error`, so the value inhabits the union; only the type cannot
 * prove it.
 *
 * # Why this is a named function and not an inline `as`
 *
 * Because "which channels needed reconciling, and was any of them hiding a real
 * shape change?" has to be answerable by grepping, the way `crate::error`'s
 * `.wire()?` is greppable for the same question one layer down. And because an
 * inline cast is invisible in review. The premise — that the runtime value
 * really does satisfy the contract — is not provable in the type system, so it
 * is pinned in `bridge.wire.test.ts` against representative payloads instead.
 */

/** Restore v1's `undefined` for a handler that used to return it. */
export async function orUndefined<T>(value: Promise<T | null>): Promise<T | undefined> {
  return (await value) ?? undefined;
}

/**
 * Assert the generated payload onto the contract type it structurally satisfies.
 *
 * Only ever for the nullability difference described above. A genuine shape
 * change must not be laundered through here — that is what the payload tests
 * exist to catch.
 */
export function asContract<T>(value: Promise<unknown>): Promise<T> {
  return value as Promise<T>;
}
