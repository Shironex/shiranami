# Research: Split monolithic usePlayerStore into focused stores (Issue #7)

**Date:** 2026-04-24
**Agent:** kirei
**Status:** complete
**Issue:** https://github.com/Shironex/shiranami/issues/7 (OPEN, labels: `refactor`, `P2-medium`, `area:frontend`)

## Problem

Issue #7 reports that `apps/web/src/stores/usePlayerStore.ts` is a single monolithic Zustand store that combines library data, queue, playback state, and UI state. Any mutation re-evaluates every selector across ~60 consuming files, and mutations like `toggleFavorite` map over both the `library` AND `queue` arrays (full copies on every click).

The task: verify the issue is still valid, then produce a concrete implementation plan.

## Root Cause — Issue Is Still Valid

Verified via `gh issue view 7 --repo Shironex/shiranami` that the issue is **OPEN**. The monolithic store at `apps/web/src/stores/usePlayerStore.ts` (493 lines) is intact. All the state the issue calls out still lives in a single `PlayerState` interface (lines 79–114):

- `library: Track[]` + `libraryLoaded: boolean`
- `queue: Track[]` + `queueIndex: number` + `currentTrack: Track | null`
- `isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`, `isShuffled`, `repeatMode`
- `isLoading`, `error`
- `crossfadeEnabled`, `crossfadeDuration`
- `scrubTime`, `_seekTarget` (UI / engine-internal)

No `useShallow` is imported or used anywhere in `apps/web/src` (confirmed via grep). Zustand `^5.0.12` is installed in `apps/web/package.json` — `useShallow` is available at `zustand/react/shallow`.

## Evidence

- `apps/web/src/stores/usePlayerStore.ts:79-114` — monolithic `PlayerState` interface still combines library, queue, playback, and UI slices.
- `apps/web/src/stores/usePlayerStore.ts:377-416` — `toggleFavorite` and `incrementTrackPlayCount` both do `library.map(...)` AND `queue.map(...)` per call, creating full-array copies.
- `apps/web/src/hooks/useAudioEngine.ts:20-21` — a `STORE_UPDATE_INTERVAL = 250` ms already throttles store `currentTime` updates to 4Hz (the high-frequency 60fps path writes to `currentTimeRef` only, not zustand). So the "60Hz state storm" described in the issue is already mitigated — but every 4Hz tick still re-fires all 144 selectors across 60 files.
- `grep` across `apps/web/src` shows **144 selector calls** to `usePlayerStore` across **60 non-test files** — all use atomic single-field selectors (pattern: `usePlayerStore(s => s.x)`). None of them would break semantically under a split; they all need a simple import-path + hook-name swap.
- `apps/web/src/stores/useMetadataEnrichStore.ts:75,109,192,196,201,211` — this sibling store reads/writes `usePlayerStore` state directly (library/queue/currentTrack). Must be updated to target the correct new stores.
- `apps/web/src/hooks/useAudioEngine.ts` — uses `usePlayerStore.getState()` and `usePlayerStore.subscribe()` in ~15 places (crossfade, seek, session tracking). These are the largest imperative consumers after the React components.
- `apps/web/src/stores/usePlayerStore.ts:175` — `currentTimeRef` is a module-level `{ current: number }` (NOT zustand state) and stays co-located with whichever store exports `Track`.
- `apps/web/src/stores/usePlayerStore.ts:464-467` — `partialize` only persists `crossfadeEnabled` and `crossfadeDuration`. Library and queue are hydrated on boot from SQLite — a split does not need to migrate a giant persisted blob.

**Selector distribution (top consumers of the current monolith):**

| Field          | Selector calls |
| -------------- | -------------- |
| currentTrack   | 25             |
| isPlaying      | 17             |
| setQueue       | 13             |
| library        | 13             |
| toggleFavorite |  8             |
| duration       |  5             |
| seek           |  4             |
| currentTime    |  4             |

This confirms the hot path is `currentTrack` / `isPlaying` / `library` — which map cleanly onto the proposed split.

## Solution Options

### Option A — Three-store split (recommended, matches issue)

Three focused stores, each created via `create<...>()((set, get) => ({ ... }))`:

1. **`useLibraryStore`** — `library`, `libraryLoaded`, `setLibrary`, `addToLibrary`, `removeFromLibrary`, `toggleFavorite` (library half), `incrementTrackPlayCount` (library half).
2. **`usePlaybackStore`** — `currentTrack`, `queue`, `queueIndex`, `isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`, `isShuffled`, `repeatMode`, `isLoading`, `error`, `crossfadeEnabled`, `crossfadeDuration`, `_seekTarget`, and all playback actions (`play`, `pause`, `next`, `previous`, `seek`, queue management, etc.).
3. **`usePlayerUIStore`** — `scrubTime`, `setScrubTime`. (Visualizer state is already in `useAppStore` per `PlayerBar.tsx:29` — `showVisualizer`/`lowPerformanceMode` live there, so there's very little UI state left to extract.)

- Pro: matches the issue's proposal exactly; clean separation by concern; library mutations (rare, huge) don't wake playback subscribers (frequent, many).
- Pro: `toggleFavorite` splits naturally — it writes to library (mostly) and only syncs `currentTrack` when affected.
- Con: `toggleFavorite` and `incrementTrackPlayCount` must now write to TWO stores. Need a small helper (or direct `usePlaybackStore.getState()` call) to sync the in-queue copy of the track.
- Con: Touches 60 consumer files + the test file + `useMetadataEnrichStore`.

### Option B — Two-store split (library vs. everything-else)

Just split `library`/`libraryLoaded` out into `useLibraryStore`; leave playback + UI combined in `usePlaybackStore`.

- Pro: ~40% less surface area; captures the biggest win (library mutations no longer wake every seekbar tick; `library.map` in `toggleFavorite` no longer triggers playback re-renders).
- Pro: `scrubTime` updates are already rare (pointer events during seek), so the cost of leaving them in the playback store is negligible.
- Con: Does not fully satisfy the issue's proposed architecture.
- Con: `currentTime` updates at 4Hz still re-wake all queue/currentTrack selectors.

### Option C — Keep monolith, add `useShallow` only

Just introduce `useShallow` / memoised derived selectors where consumers read multiple fields, without splitting.

- Pro: minimal churn.
- Con: Doesn't solve the mutation cost (`toggleFavorite` still maps over both library and queue). Zustand re-runs every selector on every `set()` regardless; `useShallow` only prevents re-renders after selector output, not selector evaluation. Does not satisfy the issue.

## Recommended Approach

**Option A — three-store split.** It matches the issue's proposal, the selector distribution supports it cleanly, and the persistence surface is tiny (only crossfade fields). The `useMetadataEnrichStore` migration is the main subtlety beyond component import swaps.

## Files to Modify

### New files (create)

- `apps/web/src/stores/useLibraryStore.ts` — new store: `library`, `libraryLoaded`, `setLibrary`, `addToLibrary`, `removeFromLibrary`, library-side of `toggleFavorite`/`incrementTrackPlayCount`. Also re-export `Track`/`RepeatMode` types here (or move types into a new `apps/web/src/stores/types.ts` and re-export from all three stores — the latter is cleaner).
- `apps/web/src/stores/usePlaybackStore.ts` — new store: `currentTrack`, `queue`, `queueIndex`, `isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`, `isShuffled`, `repeatMode`, `isLoading`, `error`, `crossfadeEnabled`, `crossfadeDuration`, `_seekTarget`, all playback/queue actions. Keep the `persist` middleware here (with the existing `NEW_KEY = 'shiranami.player-store'` name and the legacy-import logic from lines 9–57 — do NOT change the localStorage key or users lose their crossfade preference).
- `apps/web/src/stores/usePlayerUIStore.ts` — new store: `scrubTime`, `setScrubTime`. Tiny, non-persisted.
- `apps/web/src/stores/useLibraryStore.test.ts` — split out library tests from `usePlayerStore.test.ts`.
- `apps/web/src/stores/usePlaybackStore.test.ts` — split out playback tests (most of the existing test file lands here).
- `apps/web/src/stores/usePlayerUIStore.test.ts` — (optional) tiny tests for `setScrubTime`.

### Delete

- `apps/web/src/stores/usePlayerStore.ts` — replaced by the three new stores.
- `apps/web/src/stores/usePlayerStore.test.ts` — replaced by the three new test files.

### Keep `currentTimeRef` somewhere stable

- `apps/web/src/stores/usePlaybackStore.ts` — export `currentTimeRef` from the playback store (it's a playback concern). All current `import { currentTimeRef } from '@/stores/usePlayerStore'` sites (seen in `SeekBar.tsx:3`, `useAudioEngine.ts:2`, `useKeyboardShortcuts.ts:4`) must update to the new import.

### Update (60 files) — mechanical import + hook-name swap

All files listed by `grep -rl "usePlayerStore" apps/web/src --include="*.ts" --include="*.tsx"`. Each consumer uses one or more of the fields and needs the correct hook. Highlights:

**Heavy / tricky consumers (review carefully):**

- `apps/web/src/hooks/useAudioEngine.ts` — ~15 `usePlayerStore.getState()` call sites + one `usePlayerStore.subscribe()` at line 587. Most read playback state; library access is none. Mostly becomes `usePlaybackStore.getState()`. The `incrementTrackPlayCount` call at line 165 becomes `useLibraryStore.getState().incrementTrackPlayCount(...)`.
- `apps/web/src/stores/useMetadataEnrichStore.ts:75,109` — `usePlayerStore.getState().library` → `useLibraryStore.getState().library`.
- `apps/web/src/stores/useMetadataEnrichStore.ts:192` — `usePlayerStore.setState({ library: ... })` → `useLibraryStore.setState({ library: ... })`.
- `apps/web/src/stores/useMetadataEnrichStore.ts:196,201,211` — reads/writes of `currentTrack`/`queue` → `usePlaybackStore`.
- `apps/web/src/hooks/useKeyboardShortcuts.ts` — imports `currentTimeRef` from the store; update to new path.
- `apps/web/src/components/player/SeekBar.tsx` — imports `currentTimeRef` and reads `duration`, `scrubTime`, `isPlaying`, `seek`, `setScrubTime`. After split: `duration`/`isPlaying`/`seek` from `usePlaybackStore`, `scrubTime`/`setScrubTime` from `usePlayerUIStore`, `currentTimeRef` from `usePlaybackStore`.
- `apps/web/src/components/player/TimeDisplay.tsx:8-9` — reads `currentTime` (playback) and `scrubTime` (UI). Needs both hooks.

**Straightforward consumers (simple import/hook rename):**

The remaining 50+ files each pull 1–5 fields via atomic selectors. Script-level find-and-replace works for most: `usePlayerStore(s => s.currentTrack)` → `usePlaybackStore(s => s.currentTrack)`, etc. A per-field map table makes this safe.

### Action helpers that cross stores

- `toggleFavorite(trackId)` lives in `useLibraryStore`. Its implementation must also update the matching track inside `usePlaybackStore`'s `queue` and `currentTrack` when those refer to the same id. Cleanest pattern:

  ```
  toggleFavorite: (trackId) => {
    set((s) => ({ library: s.library.map(toggle) }));        // library store
    const playback = usePlaybackStore.getState();
    const updates: Partial<PlaybackState> = {};
    if (playback.queue.some(t => t.id === trackId)) updates.queue = playback.queue.map(toggle);
    if (playback.currentTrack?.id === trackId) updates.currentTrack = { ...playback.currentTrack, isFavorite: !playback.currentTrack.isFavorite };
    if (Object.keys(updates).length) usePlaybackStore.setState(updates);
    // then the IS_ELECTRON side-effect as before
  }
  ```

  Same pattern applies to `incrementTrackPlayCount`.

- `removeFromLibrary(trackIds)` should also prune matching entries from the queue (currently the monolith does NOT do this — it's a latent bug; see "Risks & Gotchas"). Worth considering at split time, but out of scope unless the user wants to bundle the fix.

### Persistence migration

- Keep `localStorage` key `shiranami.player-store` on `usePlaybackStore`. Keep the `importLegacyPlayerStore()` function (lines 33–55 of the current file) — move it into `usePlaybackStore.ts` intact. Do NOT bump version unless the persisted shape changes (it shouldn't — `crossfadeEnabled` and `crossfadeDuration` both live in the playback store).

## Reference Files (do not modify semantically)

- `apps/web/src/stores/useAppStore.ts` — good template for a persisted zustand store with migrations in this codebase.
- `apps/web/src/stores/useEqStore.ts` — good template for a smaller focused store that's consumed imperatively from `useAudioEngine.ts`.

## Risks & Gotchas

1. **Persistence key collision.** The localStorage key `shiranami.player-store` is tied to crossfade prefs. The new store that owns those fields (`usePlaybackStore`) MUST keep the same key and `partialize` shape, or existing users lose their settings on upgrade. Keep the legacy-import helper in the same file.
2. **`toggleFavorite` / `incrementTrackPlayCount` cross-store writes.** If written naively (only updating library) they will desync `currentTrack.isFavorite` and the queue's copy. Tests at `usePlayerStore.test.ts:232-257` specifically assert the three-way sync — port and expand these when you rewrite.
3. **`useMetadataEnrichStore` uses `usePlayerStore.setState({ library: ... })` directly.** Easy to miss because it's not a React selector. `grep` for `usePlayerStore.setState` and `usePlayerStore.getState()` exhaustively before assuming the migration is done.
4. **Existing latent bug (flag but do not necessarily fix):** `removeFromLibrary` (line 293) only filters the library, NOT the queue or currentTrack. If a user deletes a file that's currently playing/queued, the queue holds a stale reference. A split is a natural moment to fix this, but it's not in scope for issue #7.
5. **`_seekTarget` placement.** The issue suggests putting `_seekTarget` in the UI store. It's actually an engine-internal signal read by `useAudioEngine.ts:327,592`. Put it in `usePlaybackStore` (alongside `_setCurrentTime`, `_setDuration`, etc.) — that's where the audio hook expects to find playback internals.
6. **`useShallow` scope.** Most consumers already use atomic single-field selectors, so `useShallow` isn't needed there. The places that benefit are any component that calls multiple selectors from the same new store and wants to coalesce them — e.g., `QueuePanel.tsx:132-140` pulls 9 fields from the future `usePlaybackStore`. Consider a single `useShallow` selector there. Not required; it's a nice-to-have.
7. **HMR data migration.** The existing HMR block (`usePlayerStore.ts:477-492`) preserves store state across Vite hot reloads. Each new store needs its own equivalent HMR block, or dev HMR will reset the playing track / queue on every save.
8. **Test file count.** `usePlayerStore.test.ts` (328 lines) needs splitting. Minimum effort: move `toggleFavorite` and `_onTrackEnd` cross-store assertions carefully so both stores are seeded.
9. **`Track` type re-export.** Many non-store files do `import { type Track } from '@/stores/usePlayerStore'` (e.g. `TrackRow.tsx:1`, `NowPlayingHero.tsx:4`). Either re-export `Track` from all three new stores, or (cleaner) move `Track` and `RepeatMode` to `apps/web/src/stores/types.ts` and update imports. The latter is better long-term.

## How to Verify

1. `pnpm --filter @shiranami/web test` — all existing tests pass with the new split test files.
2. `pnpm --filter @shiranami/web typecheck` — no compile errors (ensures every consumer's imports were updated).
3. `pnpm --filter @shiranami/web build` — production build succeeds.
4. Manual smoke test in dev (`pnpm -C apps/desktop dev` or whatever the app's run script is):
   - Play a track, pause, seek, skip next/previous — verify `useAudioEngine.ts` still drives audio correctly.
   - Toggle favorite on the currently-playing track — verify heart updates in PlayerBar, TrackRow, and QueuePanel simultaneously (three-way sync preserved).
   - Import tracks — library view updates.
   - Run metadata enrichment — library re-hydrates, currentTrack/queue entries update to new metadata.
   - Toggle crossfade in settings, restart the app — preference persists (confirms localStorage key preserved).
   - On a fresh profile with a legacy localStorage entry (`shiranami.crossfade-enabled`), boot the app — legacy key migrates into the new persisted blob.
5. **Perf check (optional):** use React DevTools Profiler, play a track, and confirm `LibraryView` no longer re-renders on every 4Hz `currentTime` tick. Confirm `SeekBar` / `TimeDisplay` still do (they're supposed to).

## Open Questions

- Does the user want `removeFromLibrary` to also prune the queue as part of this refactor, or keep it as a separate follow-up bug? (Recommend: separate.)
- Does the user want `Track`/`RepeatMode` types moved to a new `stores/types.ts`, or re-exported from each store for back-compat import paths? (Recommend: new `types.ts`, single source of truth.)
- Is a `useShallow` helper for `QueuePanel` in-scope for this PR, or a follow-up? (Recommend: include, it's a one-line addition.)
