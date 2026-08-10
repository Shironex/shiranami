import { useSettingsQuery, useUpdateSettingsMutation } from './useSettings';

/**
 * The lyrics write-back opt-in, kept as a field inside the renderer `settings`
 * blob rather than as a dedicated electron-store key.
 *
 * That placement is load-bearing, not incidental. A dot-path key of its own
 * would have to be added to `RendererStoreKey`, which `store::keys`' test pins
 * against v1's `RENDERER_STORE_KEYS` tuple *exactly* — so it would also have to
 * be registered in `apps/desktop`, a v1 Electron file that v2 work does not
 * touch. Skipping that registration is worse than untidy: the Electron shell
 * guards `store:set` with a zod enum over that tuple, so the write would be
 * rejected and the toggle would look like it saved when it had not.
 *
 * The blob has neither problem. `settings` is already allowlisted on both
 * sides and is typed `Record<string, unknown>` there and `z.unknown()` in the
 * IPC schema, so a new field inside it is accepted by both shells with no
 * schema change anywhere. The Rust policy reads the same field name out of the
 * same blob (`boot::services::SAVE_FETCHED_LYRICS_FIELD`).
 *
 * The name is duplicated across that boundary and cannot be shared, so it is
 * spelled once on each side and nowhere else — a typo is a toggle that never
 * takes effect.
 */
const SAVE_FETCHED_FIELD = 'saveFetchedLyrics';

/**
 * Whether fetched lyrics are saved beside the track.
 *
 * `=== true` rather than a truthiness check: an absent field is a user who has
 * never opted in, and the one direction this must never get wrong is reading
 * "unset" as "yes, write into my music folders" — the same rule the Rust side
 * applies to the same field.
 */
export function useSaveFetchedLyricsQuery() {
  const query = useSettingsQuery();
  return {
    ...query,
    data: query.data === undefined ? undefined : query.data?.[SAVE_FETCHED_FIELD] === true,
  };
}

export function useUpdateSaveFetchedLyricsMutation() {
  // The shared settings mutation already merges the patch over the cached blob
  // and resyncs on failure, so the write cannot clobber a sibling field.
  return useUpdateSettingsMutation();
}

/** The patch this toggle sends. Keeps the field name off the call site. */
export function saveFetchedLyricsPatch(value: boolean) {
  return { [SAVE_FETCHED_FIELD]: value };
}
