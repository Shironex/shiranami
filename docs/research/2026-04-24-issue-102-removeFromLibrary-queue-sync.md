# Research: Issue #102 — `removeFromLibrary` does not prune queue or currentTrack

**Date:** 2026-04-24
**Agent:** kirei
**Status:** complete
**Issue:** https://github.com/Shironex/shiranami/issues/102

## Problem

`useLibraryStore.removeFromLibrary` is a plain `library.filter(...)` call that does
not touch `usePlaybackStore.queue`, `queueIndex`, or `currentTrack`. Every active UI
path compensates by calling a sibling helper `removeTracksFromQueue(ids)` right
after, but the store action itself is a footgun — any caller that forgets the pair
silently produces a ghost track that keeps playing audio for a file no longer in
the library.

## Root Cause

`apps/web/src/stores/useLibraryStore.ts:62-65` — the action mutates library only:

```ts
removeFromLibrary: (trackIds) => {
  const ids = new Set(trackIds);
  set((s) => ({ library: s.library.filter((t) => !ids.has(t.id)) }));
},
```

Cross-store sync logic lives **one module over** in the hook file
`apps/web/src/hooks/useRemoveFromLibrary.ts:16-44` as a standalone non-hook
function `removeTracksFromQueue(ids)` that every caller must remember to invoke
in sequence. This inverts the pattern the same store already follows for
`toggleFavorite` (line 67) and `incrementTrackPlayCount` (line 97), both of
which own their playback-sync via the in-file `syncPlaybackTrack` helper
documented at lines 32-35.

## Evidence

- `apps/web/src/stores/useLibraryStore.ts:62-65` — no playback sync in the action.
- `apps/web/src/stores/useLibraryStore.ts:32-51` — `syncPlaybackTrack` helper that
  the library store already uses for favorite/play-count. Precedent + docstring
  explicitly frame cross-store sync as library-owned.
- `apps/web/src/hooks/useRemoveFromLibrary.ts:16-44` — `removeTracksFromQueue` is
  a pure Zustand `getState`/`setState` function living in a hooks module. The
  comment on line 13 even flags "Standalone function (not a hook)".
- `apps/web/src/hooks/useRemoveFromLibrary.test.ts:38-70` — the unit tests
  **copy-paste a replica** of the function instead of importing it:
  > "Replicates the `removeTracksFromQueue` logic from the hook so we can
  > unit-test the queue index calculations without rendering React."
  Tests that re-implement their subject are a smell that the code is in the
  wrong layer.
- **Caller audit** — every production path pairs the two calls today:
  - `apps/web/src/hooks/useRemoveFromLibrary.ts:66-67` (handleRemoveFromLibrary)
  - `apps/web/src/hooks/useRemoveFromLibrary.ts:100-101` (handleDeleteFromDisk)
  - `apps/web/src/hooks/useLibraryRescan.ts:101-102` (stale-file removal)
  - `apps/web/src/components/shared/TrackContextMenu.tsx:151` — uses the hook
  - `apps/web/src/components/shared/BulkActionBar.tsx:89` — uses the hook
  - `apps/mobile/stores/usePlayerStore.ts:155` — **unrelated**; separate monolithic
    mobile store, no cross-imports with the web app. Out of scope.
- `apps/web/src/stores/useLibraryStore.test.ts:54-62` — the only `removeFromLibrary`
  test asserts the filter, nothing else. No cross-store coverage exists.

## Is the bug reproducible on master?

The issue's "Steps to reproduce" (context menu → remove) are **not** reproducible
via the UI today, because both the context menu and bulk bar funnel through
`useRemoveFromLibrary`, which already calls `removeTracksFromQueue`. The bug is
therefore **latent, not active** — the store action's shape invites future
regressions and the tests don't cover the contract. Issue is still valid as a
correctness/architecture fix (the action's name promises more than it does).

## Solution Options

### Option A — Consolidate into the store action (recommended)

Move `removeTracksFromQueue`'s logic into `useLibraryStore.removeFromLibrary`,
mirroring how `toggleFavorite`/`incrementTrackPlayCount` already own their
playback sync. Delete the standalone helper and have `useRemoveFromLibrary` +
`useLibraryRescan` drop the paired call. Replace the replica-based tests in
`useRemoveFromLibrary.test.ts` with real tests in `useLibraryStore.test.ts`.

- Pro: eliminates the footgun — no caller can ever forget the sync.
- Pro: matches the existing precedent in the same file (favorite/play-count).
- Pro: real tests drive real code (no more copy-paste replica).
- Pro: store-owned cross-store sync is already an established pattern
  (`syncPlaybackTrack` lives here for exactly this reason).
- Con: slight cross-store coupling (library store reads/writes playback store),
  but that coupling already exists via `syncPlaybackTrack` and is intentional.

### Option B — Keep the helper, document the contract

Leave `removeTracksFromQueue` where it is, rename `removeFromLibrary` (e.g.
`removeFromLibraryOnly` or `_removeFromLibraryRaw`) to communicate it does not
sync, and add JSDoc warnings.

- Pro: no behavior change.
- Con: doesn't fix the bug class — future callers still have to remember to
  pair the calls; code reviewers have to catch it.
- Con: leaves the "tests replicate the function" smell unaddressed.

### Option C — Delete-on-filter via subscription

Have `usePlaybackStore` subscribe to `useLibraryStore.library` and reactively
prune queue entries whose ids disappear.

- Pro: decouples the stores.
- Con: reactive invariants over zustand state are fragile and hard to reason
  about (ordering of updates, StrictMode double-fires, etc.).
- Con: breaks the radio/preview case — tracks are deliberately in the queue
  *without* being in the library, and a subscription would nuke them on any
  library update.
- Rejected.

## Recommended Approach

**Option A.** The store action's behavior becomes self-contained, the footgun
disappears, tests exercise real code, and the pattern aligns with the two
neighboring actions in the same file.

## Files to Modify

- `apps/web/src/stores/useLibraryStore.ts` — rewrite `removeFromLibrary` (lines
  62-65) so it, in a single `set` pass:
  1. Filters `library` by the id set.
  2. Reads `usePlaybackStore.getState()` for `queue`, `queueIndex`, `currentTrack`.
  3. If none of the ids appear in `queue` and none match `currentTrack.id`, skip
     the playback update (mirrors `syncPlaybackTrack`'s early-return).
  4. Otherwise compute `newQueue = queue.filter((t) => !ids.has(t.id))`,
     decrement `newIndex` for every removed entry at an index `< queueIndex`,
     and branch on whether `currentTrack.id` was removed:
     - current-track removed: `nextTrack = newQueue[Math.min(newIndex, newQueue.length - 1)] ?? null`;
       write `{ queue, queueIndex: nextTrack ? Math.min(newIndex, newQueue.length - 1) : -1, currentTrack: nextTrack, currentTime: 0, isPlaying: !!nextTrack }`
       (matches `next()` semantics — reset currentTime, keep playing if a next
       track exists, stop cleanly if empty).
     - current-track survived: write `{ queue, queueIndex: Math.min(newIndex, Math.max(newQueue.length - 1, 0)) }`.
  5. Both branches should use `usePlaybackStore.setState(updates)` after the
     library `set`, the same way `syncPlaybackTrack` does.
- `apps/web/src/hooks/useRemoveFromLibrary.ts` — delete the exported
  `removeTracksFromQueue` function (lines 16-44) and the two paired call sites
  inside the hook (lines 67 and 101). The hook keeps its DB-call + toast +
  query-invalidation responsibilities; it just stops double-bookkeeping the
  queue.
- `apps/web/src/hooks/useLibraryRescan.ts` — drop the
  `import { removeTracksFromQueue } ...` at line 13 and the call at line 102.
  The store action now handles it.
- `apps/web/src/stores/useLibraryStore.test.ts` — add a `describe('removeFromLibrary')`
  block mirroring the `toggleFavorite` three-state matrix (see lines 67-117):
  1. "removes from library and prunes queue + currentTrack when currently playing"
     — assert `isPlaying: true`, `currentTime: 0`, `currentTrack` advanced, `queueIndex` points at next.
  2. "adjusts queueIndex down when removing tracks before the current index"
     — seed queueIndex=2 with 5 tracks, remove t0+t1, assert queueIndex=0 and
     current unchanged.
  3. "does not change queueIndex when removing tracks after the current index".
  4. "clears playback entirely when all queued tracks are removed" — empty
     queue, queueIndex -1, currentTrack null, isPlaying false.
  5. "does nothing to playback when removed ids are not queued" — library-only
     removal leaves queue/current/isPlaying untouched.
  6. "handles the radio/preview case where a queued track isn't in the library"
     — track only in queue (not library); removing by id still prunes the
     queue. (Symmetry with the existing `toggleFavorite` radio test.)
- `apps/web/src/hooks/useRemoveFromLibrary.test.ts` — delete the file entirely.
  Its 7 test cases are now covered by the new `useLibraryStore.test.ts` block
  above (the replica function it tested no longer exists). The file's mocks for
  `sonner`, `react-i18next`, `queryClient`, `libraryKeys` were only in service
  of testing a copy-pasted replica — none of the hook's own behavior
  (DB call, toast, invalidateQueries) was actually covered. If the build agent
  wants to preserve that coverage separately it can add a thin
  `useRemoveFromLibrary.integration.test.ts` later, but that's out of scope
  for this fix.

## Reference Files (do not modify)

- `apps/web/src/stores/useLibraryStore.ts:32-51` — `syncPlaybackTrack` helper.
  The new `removeFromLibrary` should follow the same shape: read playback
  state, short-circuit if nothing to sync, otherwise compute an `updates`
  object and call `usePlaybackStore.setState(updates)`.
- `apps/web/src/stores/usePlaybackStore.ts:275-296` — existing `removeFromQueue`
  action. Note: it does NOT reset `currentTime` or touch `isPlaying`. Our new
  code should follow `removeTracksFromQueue`/`next()` semantics instead (reset
  currentTime, set `isPlaying: !!nextTrack`) because library-forced removal is
  semantically a forced-advance, not a user-initiated queue edit.
- `apps/web/src/stores/usePlaybackStore.ts:174-195` — `next()` for the
  reset-currentTime-keep-playing pattern.
- `apps/web/src/stores/useLibraryStore.test.ts:67-117` — the `toggleFavorite`
  three-state matrix to mirror in the new test block.
- `apps/mobile/stores/usePlayerStore.ts` — mobile-only monolithic store. Not
  affected.

## Risks & Gotchas

- **Radio/preview tracks** — tracks can be in the queue without being in the
  library (e.g. radio). The new code must branch on "is any id in queue OR
  does any id match currentTrack" independently of whether the id is in the
  library. The existing `syncPlaybackTrack` handles this correctly; mirror its
  structure.
- **`isPlaying` toggle on empty-queue** — when every queued track is removed
  and `currentTrack` was one of them, we must set `isPlaying: false` so the
  audio engine stops. The existing `removeTracksFromQueue` does this via
  `isPlaying: !!nextTrack`. Do not omit it.
- **`currentTime: 0` only on current-track-removed branch** — resetting
  `currentTime` on the non-current-removed branch would cause a seek glitch
  during background removals (e.g. rescan pruning a stale track while user is
  mid-song on a different track). Keep the reset strictly inside the
  current-track-removed branch.
- **Single `set` ordering** — call `set({ library })` first, then
  `usePlaybackStore.setState(updates)`. React subscribers of the playback
  store will see a consistent library snapshot. The order matches how
  `toggleFavorite` is structured (line 77 library update, line 82 playback
  sync).
- **`useLibraryRescan.ts` `clearLibrary` path (lines 141-161)** — already
  calls `clearQueue()` directly. No change needed; leave it alone.
- **No persistence concerns** — `usePlaybackStore`'s `partialize` (lines
  378-381) only persists `crossfadeEnabled`/`crossfadeDuration`. queue/
  currentTrack are in-memory and will correctly no-op on SSR.
- **Coupling direction** — library store already imports from playback store
  at line 4. Adding more playback writes inside library actions is an
  expansion of an existing coupling, not a new one.

## How to Verify

1. **Manual** (Electron dev):
   - Start playing track A. Open context menu on A → "Remove from library".
     Expect: the next track in the queue begins playing at `currentTime: 0`,
     or playback stops cleanly if A was alone.
   - Queue tracks A, B, C. Play B. Remove A via context menu.
     Expect: B keeps playing uninterrupted, `queueIndex` drops from 1 to 0.
   - Queue tracks A, B, C. Play B. Remove C via context menu.
     Expect: B keeps playing, queueIndex unchanged at 1, queue length 2.
   - Bulk-select the entire queue in the library view and remove.
     Expect: playback stops, queue empties, currentTrack null.
   - Trigger a rescan where a currently-playing track's file has been deleted
     on disk. Expect: playback advances or stops cleanly.
2. **Automated** — `pnpm -F @shiranami/web test src/stores/useLibraryStore.test.ts`
   passes with the new test cases. `pnpm -F @shiranami/web test` passes
   overall (and the deleted `useRemoveFromLibrary.test.ts` is gone from the
   suite).
3. **Typecheck** — `pnpm -F @shiranami/web typecheck` passes; no dangling
   imports of `removeTracksFromQueue`.
4. **Grep gate** — `rg "removeTracksFromQueue" apps/` returns zero matches
   after the change.

## Open Questions

- None blocking. The "match `next()` semantics" decision (reset currentTime,
  keep isPlaying) is firmly supported by the existing `removeTracksFromQueue`
  behavior plus the issue's expected-behavior wording ("advance to the next
  track"). If the user later wants library-removal to behave like
  `removeFromQueue` instead (preserve currentTime, leave isPlaying alone),
  that's a separate UX discussion.
