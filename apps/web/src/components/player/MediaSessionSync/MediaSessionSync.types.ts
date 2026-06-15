/**
 * `MediaSessionSync` renders `null` — it exists purely for its currentTime-driven
 * side-effects (OS overlay position state + throttled playback-state IPC). The
 * hook owns those effects and returns nothing renderable, so the view contract
 * carries no fields.
 */
export interface IMediaSessionSyncView {
  /** Marker field — the sync leaf has no render output and no derived view data. */
  readonly noop?: never;
}
