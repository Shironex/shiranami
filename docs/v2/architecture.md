# Shiranami v2 — Architecture & Port Plan

**Status:** decided plan (supersedes the three research reports)
**Date:** 2026-08-01 · **Target branch:** `v2` · **Repo:** `Shironex/shiranami`
**Inputs:** `backend-inventory.md` (40 subsystems, 155 IPC channels), `nightcore-reference.md`
(in-house Rust/Tauri prior art), `tauri-feasibility.md` (ecosystem + reference-app research).

Where the inputs disagreed or left options open, this document picks one. Every such pick is a
`**Decision:**` line; the complete list is indexed in Appendix A.

---

## 1. Verdict & goals

**GO — full Rust port of the Electron main process onto Tauri v2. No TypeScript sidecar, ever.**

Every npm dependency in `apps/desktop/src/main` has a mature Rust equivalent (feasibility §5.2:
zero gaps). The two external binaries (`yt-dlp`, `ffmpeg`) are already runtime-downloaded, so
even Tauri's `externalBin` is unnecessary. Nightcore's sidecar exists solely because the Claude
Agent SDK is npm-only _and_ stateful/streaming; nothing in shiranami qualifies on either count,
and the seam costs ~65 MB/arch plus a crash-reaper, a backpressure writer, a cwd trap and a
cross-compile matrix.

> **Decision:** No TS sidecar. If a genuine npm-only one-shot need ever appears, use
> spawn-per-call (`bun build --compile` utility, argv in / JSON out), never a persistent
> multiplexed sidecar.

### 1.1 Scope

| Layer                                                  | LOC (non-test) | Fate                                 |
| ------------------------------------------------------ | -------------: | ------------------------------------ |
| `apps/desktop/src/main/**`                             |      17,116 TS | rewritten in Rust                    |
| `apps/desktop/src/native/**` (C++ N-API, excl. vendor) |        784 C++ | rewritten in Rust                    |
| `packages/{database,contracts,shared,recommendation}`  |       4,722 TS | mostly Rust; `contracts` → generated |
| `apps/web/src/**`                                      |  59,213 TS/TSX | **stays, ~1 new folder**             |

**The audio engine stays in the renderer. This is settled and not reopened by this plan.**
`useAudioEngine.ts` (dual `HTMLAudioElement` decks, equal-power crossfade, per-deck loudness
gain) and `audioAnalyser.ts` (one `AudioContext` → 2× `MediaElementSource` → EQ chain →
limiter → `AnalyserNode`) are untouched. The Rust process is a **byte server**, not a playback
engine. Nothing in `rodio`/`cpal` is required. Two of the three largest Tauri music players —
including nuclear (18k★), itself an Electron→Tauri music-player migration — keep the whole Web
Audio graph in the webview.

### 1.2 Footprint & performance goals

Baselines are measured in Phase 0 (task P0-C) and pasted into this table before Phase 1 merges.
Reference point: museeks' Electron→Tauri migration went 201.4 MB → 8.1 MB installer, CPU halved,
memory −37%.

| Metric                                     | v1 baseline                                | v2 goal                                                               | Measured how                    |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------- |
| Installer size (per platform)              | _TBD P0-C_                                 | **≤ 30 MB**                                                           | artifact bytes in CI            |
| Idle RSS, 5,000-track library, window open | _TBD P0-C_                                 | **≤ 220 MB** total across all processes                               | `sysinfo` sum, 60 s after boot  |
| RSS during full library scan               | _TBD P0-C_                                 | **≤ v1** (no `utilityProcess` heap-reclaim trick available or needed) | peak RSS delta                  |
| Cold start → first paint                   | _TBD P0-C_                                 | **≤ v1**, hard ceiling 1.5 s                                          | `BootTimer` INFO log line       |
| OS process count at idle                   | 5+ (main, renderer, GPU, utility, workers) | **≤ 3** (app, webview host, crash reporter)                           | Activity Monitor / Task Manager |

Non-goals for v2.0: native Rust playback, output-device selection, true gapless, BPM detection
(post-v2), OS-keychain secrets (post-v2), Linux packaging.

### 1.3 What stays TypeScript

| Stays TS                                                                               | Why                                                                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| all of `apps/web/src` incl. the Web Audio graph                                        | the point of the port                                                                          |
| `packages/shared`                                                                      | pure utils shared with `apps/landing`; constants get a **mirror**, not a move                  |
| `packages/contracts` (thin)                                                            | becomes generated bindings + the few TS-only constants; still the `apps/server` share-DTO home |
| `apps/landing` (Astro), `apps/server` (NestJS), `apps/mobile` (Expo, paused-by-design) | untouched — mobile still imports `@shiranami/contracts`, don't break it                        |
| `packages/eslint-plugin`, `tools/{codegen,lint-meta}`, Husky/commitlint                | dev tooling                                                                                    |
| Vitest + Storybook for `apps/web`                                                      | unaffected; relatively _more_ valuable after E2E churn                                         |

---

## 2. Target architecture

### 2.1 Layout

A **cargo workspace at the repo root**, inside the existing pnpm workspace. Not a fork.

> **Decision:** cargo workspace of domain crates, not nightcore's single-crate shape. Nightcore's
> 92k-line single crate had to retrofit a 6-tier lint + a shrinking file-size ratchet; shiranami's
> 22k backend maps cleanly onto domain boundaries, and crate boundaries give compile-time layering
> for free plus `cargo test -p shiranami-db` with no webview. Carry nightcore's _rules_ (400
> code-line file cap, `mod.rs` is a manifest, no globals) from day one rather than as a retrofit.

```
shiranami/
├── Cargo.toml                     # [workspace] members = ["crates/*", "apps/desktop-tauri/src-tauri"]
├── Cargo.lock  rust-toolchain.toml  rustfmt.toml  clippy.toml
├── crates/
│   ├── shiranami-core/            # models · error taxonomy · paths+path-safety+folders-cache
│   │                              #   settings store (atomic JSON) · system notices · sentinels
│   ├── shiranami-net/             # reqwest client · HttpError · per-host rate gates · SSRF guard
│   ├── shiranami-db/              # sqlx pool · migrations · ledger adoption · repos · backup
│   ├── shiranami-audio/           # symphonia decode · peaks · ebur128 LUFS · (bpm, post-v2)
│   ├── shiranami-metadata/        # lofty read/write · art extract+hash+cache+prune · iTunes lookup
│   ├── shiranami-library/         # folder scan (walkdir+rayon) · validate · storage usage
│   ├── shiranami-downloader/      # yt-dlp/ffmpeg managers · spawn hardening · queue · extraction
│   ├── shiranami-integrations/    # lyrics · weather · scrobble · discord · share
│   ├── shiranami-recommendation/  # core/ (pure scoring) + service/ (shelves, RD-mix discovery)
│   ├── shiranami-serve/           # ⭐ axum localhost byte server: audio Range · art · radio proxy
│   └── shiranami-media-controls/  # souvlaki: SMTC + MPNowPlayingInfoCenter + media keys
├── apps/
│   ├── web/                       # UNCHANGED + src/lib/bridge/ (the only new folder)
│   ├── desktop/                   # 🕯 Electron — frozen, carries the v1.x bridge release
│   ├── desktop-tauri/src-tauri/   # thin shell: main.rs lib.rs setup.rs commands/ events.rs
│   │                              #   tray.rs shortcuts.rs deep_link.rs window.rs bindings.rs
│   └── landing/ server/ mobile/   # untouched
├── packages/
│   ├── contracts/src/generated/   # ⭐ emitted by tauri-specta, committed + CI-diffed
│   ├── shared/ eslint-plugin/     # stay
│   └── database/ recommendation/  # 🕯 frozen; deleted at cutover
└── tools/                         # stays; lint-meta gains Rust text-scan rules
```

> **Decision:** the axum stream server is its own crate (`shiranami-serve`), not
> `src-tauri/src/stream_server.rs` as the feasibility report proposed. Range parsing, the art LRU,
> the redirect-revalidating radio proxy and the CORS header set are real logic whose failure mode
> is _silent_ (a missing `Access-Control-Allow-Origin` = a totally silent macOS player). It must be
> testable with plain `cargo test` + `reqwest` against an ephemeral port, with no webview.

> **Decision:** `src-tauri` stays ≲1,000 LOC of wiring. Any file there that grows past the 400
> code-line cap is a signal that logic belongs in a crate.

**Crate dependency spine (enforced by workspace deps + a `lint-meta` text rule, never upward):**

```
core → net → { db, serve, metadata, integrations }
core → audio
{ db, metadata } → library
{ net, db } → downloader
{ db, downloader } → recommendation
{ core } → media-controls
everything → src-tauri (composition root only)
```

### 2.2 All 40 subsystems mapped

| #   | Subsystem                          | Home in v2                                                            | Port note                                                                                                                         |
| --- | ---------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App bootstrap & lifecycle          | `src-tauri/lib.rs` + `setup.rs`                                       | boot order is load-bearing — §2.8                                                                                                 |
| 2   | Window mgmt + CSP                  | `src-tauri/window.rs` + `tauri.conf.json`                             | CSP becomes static config; compact-mode multi-display validation ports 1:1 via `Monitor::work_area`                               |
| 3   | Persistent settings store          | `core::settings` + `core::atomic`                                     | see Decision on `tauri-plugin-store` below                                                                                        |
| 4   | File logger                        | `src-tauri/infra/logging.rs`                                          | `tracing` + `tracing-appender` daily roll; **keep `<data>/logs/shiranami-YYYY-MM-DD.log` naming**                                 |
| 5   | Sentry (opt-in)                    | `src-tauri` + `core::scrub`                                           | `tauri-plugin-sentry` (by the `@sentry/electron` author) + `sentry-rust-minidump`                                                 |
| 6   | Auto-update                        | `src-tauri/commands/updater.rs`                                       | `tauri-plugin-updater`; §4 owns the handover                                                                                      |
| 7   | Tray + system behaviour            | `src-tauri/tray.rs`                                                   | `tauri::tray` + `tauri-plugin-autostart`                                                                                          |
| 8   | Global media keys / OS integration | `shiranami-media-controls`                                            | souvlaki, §2.7                                                                                                                    |
| 9   | Discord Rich Presence              | `integrations::discord`                                               | `discord-rich-presence`; throttle/backoff state machine is the real work                                                          |
| 10  | System notices                     | `core::notice`                                                        | 5-min per-`source:code` dedup preserved                                                                                           |
| 11  | Custom protocols (audio/radio/art) | `shiranami-serve`                                                     | **no custom scheme** — §2.4                                                                                                       |
| 12  | Path / URL safety                  | `core::paths` (containment, folders-cache) + `net::url_safety` (SSRF) | port the TS test vectors _first_                                                                                                  |
| 13  | Database                           | `shiranami-db`                                                        | sqlx; §3.2 owns the ledger                                                                                                        |
| 14  | Database IPC (45 ch.)              | `db::repo/*` + `src-tauri/commands/db_*.rs`                           | smart-playlist rule→SQL is the only real logic; keep the LIKE `ESCAPE '\'` guard                                                  |
| 15  | DB backup/export/import            | `db::backup`                                                          | `rusqlite`-style `.backup()` via sqlx `VACUUM INTO`; magic-header + downgrade check before overwrite                              |
| 16  | Library scan pipeline              | `shiranami-library`                                                   | `utilityProcess` handshake collapses into a `CancellationToken`                                                                   |
| 17  | Metadata read/lookup/enrich/write  | `shiranami-metadata`                                                  | `lofty` replaces music-metadata + node-id3 + flac-tagger **and** the ffmpeg re-mux path                                           |
| 18  | Album-art cache                    | `metadata::art` (write/hash/prune) + `serve::art` (read/LRU)          | §3.3 owns hash stability                                                                                                          |
| 19  | yt-dlp / ffmpeg binary managers    | `downloader::bin`                                                     | `zip` crate deletes the 3-tier Windows extraction fallback                                                                        |
| 20  | Download queue                     | `downloader::queue`                                                   | tokio task pool + `CancellationToken`; write-through to `download_queue` table                                                    |
| 21  | Playlist extraction (YT/Spotify)   | `downloader::extract`                                                 | port `spotify-match.ts` + its fixture verbatim                                                                                    |
| 22  | Lyrics                             | `integrations::lyrics`                                                | `reqwest` + `lofty` embedded + LRC parser                                                                                         |
| 23  | Weather                            | `integrations::weather`                                               | `reqwest` + `serde`                                                                                                               |
| 24  | Recommendations                    | `recommendation::{core,service}`                                      | pure scoring in `core`; SQL aggregation + RD-mix discovery in `service`                                                           |
| 25  | Scrobbling                         | `integrations::scrobble`                                              | `reqwest` + `md-5`; **persist the retry queue** (today it's memory-only)                                                          |
| 26  | Share / deep links                 | `integrations::share` + `src-tauri/deep_link.rs`                      | `tauri-plugin-deep-link` + `-single-instance`; server DTO contract survives unchanged                                             |
| 27  | Waveform peaks (C++)               | `audio::peaks`                                                        | §2.9                                                                                                                              |
| 28  | Loudness / EBU R128 (C++)          | `audio::loudness`                                                     | `ebur128` crate is the Rust port of the vendored libebur128; symphonia coverage lets us **delete the ffmpeg fallback**            |
| 29  | Storage / disk usage               | `library::storage`                                                    | `walkdir` + `MetadataExt::dev()`; Windows drive-root bucketing unchanged                                                          |
| 30  | Shell / dialogs / app info         | `src-tauri/commands/{shell,dialog,app}.rs`                            | `tauri-plugin-dialog`, `-opener`, `trash`, `sys-locale`                                                                           |
| 31  | Debug metrics panel                | `src-tauri/commands/debug.rs`                                         | **shape changes** — no Chromium `getAppMetrics` equivalent; `sysinfo` per-process CPU/RSS only                                    |
| 32  | HTTP client + rate gates           | `shiranami-net`                                                       | `reqwest` + `governor`                                                                                                            |
| 33  | IPC framework                      | `core::error` + command conventions                                   | serde gives arg validation free; §2.6 keeps the renderer-visible error _behaviour_                                                |
| 34  | Preload / contextBridge            | `apps/web/src/lib/bridge/`                                            | §2.6                                                                                                                              |
| 35  | `@shiranami/contracts`             | generated bindings + TS-only constants                                | §2.5                                                                                                                              |
| 36  | `@shiranami/shared`                | stays TS; `core::constants` mirrors the frozen sentinels              | `UNKNOWN_ARTIST`/`UNKNOWN_ALBUM` are baked into shipped migration SQL — a Rust mirror with an equality test, never a redefinition |
| 37  | `@shiranami/recommendation`        | `shiranami-recommendation::core`                                      | ideal first port; fully unit-tested                                                                                               |
| 38  | Build / packaging                  | cargo + `tauri.conf.json` + CI                                        | esbuild, node-gyp, asarUnpack, fuses, ABI rebuilds all become non-concepts                                                        |
| 39  | `apps/server` (NestJS)             | unchanged                                                             | still a live runtime dep of share/import                                                                                          |
| 40  | Renderer audio engine              | unchanged                                                             | do not port                                                                                                                       |

### 2.3 Cross-cutting Rust conventions (lifted from nightcore, non-negotiable)

| Rule                                                                                                                                                                                               | Why                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No synchronous `#[tauri::command]`** that touches disk, DB, network, or a child process                                                                                                          | a sync command runs on the WKWebView main thread and freezes the UI. `async` + `spawn_blocking`; freeze the cheap in-memory survivors in a `SYNC_COMMAND_ALLOWLIST` ratchet test |
| **`tauri::async_runtime::spawn`, never bare `tokio::spawn`** on any path reachable from a sync command/callback                                                                                    | nightcore shipped a SIGABRT to users over this; pin with a source-grep regression test                                                                                           |
| **No globals.** `app.manage(...)` + `Arc<dyn Trait>` seams for would-be cycles                                                                                                                     | trait seam lives in a rank-1 module; lint the cycle shut                                                                                                                         |
| **`sync::lock_or_recover`** instead of `.expect("poisoned")`                                                                                                                                       | 3 lines, removes a crash class; every mutex guards plain data                                                                                                                    |
| `tokio::sync::Mutex` only when held across `.await`; CI enforces `clippy::await_holding_lock`                                                                                                      |                                                                                                                                                                                  |
| **`store/atomic.rs` wholesale**: `write_atomic` (temp + `sync_data` + rename), `create_owner_only` (0600 at creation), `quarantine_corrupt`                                                        | a torn write or defaults-over-corruption bug loses a user's library                                                                                                              |
| **Never `CARGO_MANIFEST_DIR` as a runtime path**                                                                                                                                                   | it is a _build machine_ path; a CI-built release shipped broken over exactly this                                                                                                |
| `platform::hydrate_login_path()` at startup, single-threaded                                                                                                                                       | a Finder/Dock launch inherits launchd's minimal PATH; the ffmpeg-on-PATH fallback dies without it. Use `fix-path-env-rs`                                                         |
| `kill_on_drop(true)` on every spawned child (yt-dlp, ffmpeg, xattr)                                                                                                                                | Windows orphaning is real; nightcore's implicit stdin-EOF shutdown is a known gap                                                                                                |
| Persisted/wire structs are **strictly additive** — new fields `Option` with a field-absent pinning test                                                                                            | never a breaking required field                                                                                                                                                  |
| High-frequency emits keep their **throttle + coalescing** (scan/download progress: 250 ms, immediate on structural change) and use `RawValue` single-serialization when both emitted and persisted |                                                                                                                                                                                  |
| Errors: `thiserror` enum → serializable `{ code, message, details }` on the wire                                                                                                                   | nightcore's warning: "do not end up with neither a typed enum nor a wire taxonomy"                                                                                               |

### 2.4 The localhost audio/art streaming server

> **Decision:** serve audio, album art, and the radio proxy over a **loopback axum HTTP server**
> (`http://127.0.0.1:<port>/…`), not Tauri's asset protocol and not a custom URI scheme.

Rationale, in order of weight:

1. **wry#1778 (open, filed 2026-07-21, zero comments).** macOS 26.6 stopped delivering
   _cross-scheme_ subresource requests to `WKURLSchemeHandler`. A page on `tauri://localhost`
   referencing `asset://` or `shiranami-audio://` never invokes the handler. `http://127.0.0.1`
   is not a custom scheme and is not affected. This kills **both** Option A and Option B on
   current macOS — for audio _and_ for every album-art `<img>`.
2. **Byte-for-byte header control.** `crossOrigin='anonymous'` is already set on both decks
   (`useAudioEngine.ts` L494/499). Without `Access-Control-Allow-Origin`, the spec mandates that
   `MediaElementAudioSource` emit **silence** — a macOS-only, totally silent player. We must own
   those headers.
3. **Convergent evidence.** Both nuclear and museeks ship exactly this; museeks' source comment
   names Tauri issue #3725 as the reason.
4. Our `isPathAllowed()` containment check ports unchanged instead of being rewritten as an
   `assetProtocol.scope` glob list.

Server contract:

| Aspect          | Decision                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bind            | `127.0.0.1` only, port 0 (ephemeral, OS-assigned) — never a fixed range, never `0.0.0.0`                                                                                                                                                                                             |
| Auth            | per-session random 32-byte path token: `/{token}/audio?path=…`. Token is generated at boot, handed to the webview by a command, never persisted                                                                                                                                      |
| Routes          | `/{tok}/audio` (Range, 206, `Accept-Ranges`, extension allowlist, `isPathAllowed`), `/{tok}/art/<hash>.jpg` (5 MB LRU, `Cache-Control: immutable`), `/{tok}/radio?url=` (≤5 manual redirect hops, **every hop re-validated through the SSRF guard**, `Icy-MetaData: 0`, abort → 499) |
| CORS            | `Access-Control-Allow-Origin: <webview origin>`, `Allow-Headers: Range`, `Expose-Headers: Content-Range, Content-Length, Accept-Ranges`                                                                                                                                              |
| Lifetime        | started in `setup()`, port + token stored in managed state, shut down on `ExitRequested`                                                                                                                                                                                             |
| Renderer change | one URL-builder helper (`shiranami-audio://play?path=` → `${base}/audio?path=`); the URL is constructed in a single place today                                                                                                                                                      |

CSP gains `connect-src`/`media-src`/`img-src http://127.0.0.1:*` (port unknown at config time).
Enumerate the full allowlist in `tauri.conf.json` from day one — `radio-browser.info` (renderer
calls it directly today) plus the loopback origin. Auditing a permissive CSP later is the
expensive direction.

### 2.5 Type bindings: tauri-specta

Nightcore's lesson says plain `ts-rs` suffices "if the only boundary is Tauri IPC". Shiranami's
boundary is **155 channels across 24 namespaces**, and the renderer's call sites must keep
working through a shim — which means the shim needs a _typed callable_ per channel, not just a
type. `ts-rs` gives types only; 155 hand-written `invoke` wrappers is exactly the hand-maintained
list that already drifted by 7 channels once in this repo (per the preload allowlist history).

> **Decision:** `tauri-specta` `=2.0.0-rc.25` + `specta` `=2.0.0-rc.25` (exact pins, as nuclear
> ships), emitting typed `commands.*` and `events.*` into `packages/contracts/src/generated/`.
> `ts-rs` 12 remains the documented fallback: because the React side imports from
> `@shiranami/contracts` and never from specta, swapping to ts-rs later touches one file plus a
> hand-written invoke wrapper.

Carried over from nightcore regardless of which generator wins:

| Guard                                                                                             | Implementation                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Regenerate-and-diff**                                                                           | export runs inside `cargo test`; CI runs `git diff --exit-code packages/contracts/src/generated`                                                                                                                                                                                 |
| **Anti-vacuity prover** (`pnpm verify:drift-guard`)                                               | perturbs a `#[derive(specta::Type)]` field, re-runs the identical battery, and **requires it to fail**. Nightcore's drift guard passed vacuously for its entire life (issue #422) because the export dir env var was unset — a guard that silently no-ops is worse than no guard |
| **Export path is a compile-time constant in Rust**, not an env var read from `.cargo/config.toml` | removes the cwd-dependence that caused #422 outright. Document "run cargo from the crate dir" anyway                                                                                                                                                                             |
| **One channel-name registry**                                                                     | event names live in one Rust const block, emitted into the bindings; a `cargo test` asserts every scattered `*_EVENT` const equals its registry entry                                                                                                                            |
| Bindings are **committed**, not gitignored                                                        | so the diff guard has something to diff and `apps/web` typechecks without cargo                                                                                                                                                                                                  |

Command naming maps mechanically from today's channels: `db:tracks:get-all` →
`db_tracks_get_all`. A generated `legacy-map.ts` pairs each old channel string with its new
command name so the shim is data-driven and call sites migrate file-by-file if ever needed.

### 2.6 The `window.electronAPI` bridge shim

> **Decision:** the renderer keeps calling `window.electronAPI.*`. The feasibility report named the
> global `window.shiranami.*`; the inventory (which read `preload/index.ts`) is authoritative —
> it is `window.electronAPI`, composed from 24 namespace modules and typed by
> `packages/contracts/src/ipc/preload-api.ts`. Renaming it would touch the 59k-LOC renderer for
> zero benefit.

`apps/web/src/lib/bridge/` installs an object of the **exact same 24-namespace shape** onto
`window.electronAPI` before React mounts, implemented over the generated `commands`/`events`.
`preload-api.ts` stays the contract and its existing conformance test moves to `apps/web`.

Reproducing _behaviour_, not just names — the four things that will otherwise regress silently:

| Preload behaviour today                                                                                                                         | Shim requirement                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IpcError` sentinel (`__IPC_ERROR__` + JSON in the Error message) decoded in preload so `isIpcError(e)`, `.code`, `.details` work renderer-side | Rust returns a real `Err({code,message,details})` payload — **the sentinel is deleted server-side**. The shim reconstructs an `IpcError`-shaped `Error` from the rejection so `isIpcError` and all four code registries (`YT_DLP_*`, `SHARE_*`, `PLAYLIST_*`, `VALIDATION_*`) keep working unchanged |
| Per-channel `subscribe` returning a **precise** unsubscribe (removes only that listener; multiple components share a channel)                   | wrap Tauri `listen` with a per-channel fan-out registry; the returned unlisten removes one handler, and is **idempotent and non-throwing** (React `<StrictMode>` double-mounts effects; Tauri's raw unlisten throws on a removed registration — this produced stray error toasts in nightcore)       |
| `handleWithFallback` semantics (some channels resolve to a fallback instead of rejecting)                                                       | preserved on the **Rust** side, per channel, exactly as today; the shim adds nothing                                                                                                                                                                                                                 |
| `platform`, `__e2e`, error-code registries also exposed                                                                                         | re-exposed by the shim; `__e2e` gets a Tauri-native implementation for the new E2E harness                                                                                                                                                                                                           |

Plus nightcore's mock path: `isTauri()` = `'__TAURI_INTERNALS__' in window`; outside the webview
every command resolves to **mock data instead of rejecting**, which is what makes the `:5173`
mock-mode target and Storybook work. Every inbound event payload is re-validated by a zod
narrower and dropped if it fails — the Rust side is trusted structurally, not blindly.

### 2.7 Media controls: souvlaki, mediaSession off

> **Decision:** OS media integration is **native Rust via `souvlaki` 0.8** on day one, and the
> webview's media session is **suppressed**. No `tauri-plugin-global-shortcut` registration for
> media keys (souvlaki's SMTC/MPRemoteCommandCenter buttons cover them); the plugin stays
> available only as a settings-gated escape hatch if Windows key delivery proves flaky.

Why not `navigator.mediaSession` (which macOS relies on 100% today):

- **macOS:** Safari bridges mediaSession → `MPNowPlayingInfoCenter`; an embedded WKWebView
  **does not**. macOS media keys break outright.
- **Windows:** mediaSession _does_ reach the SMTC flyout from Tauri, but renders the app as
  **"Unknown app" / "Microsoft Edge WebView2"** — WebView2Feedback#2236, open since 2022-03, MS
  engineer 2024-09: _"There is no update or work currently happening here."_ Permanent.

Suppression is platform-specific:

| Platform | Action                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | `with_additional_browser_args("--disable-features=MediaSessionService,HardwareMediaKeyHandling,GlobalMediaControls …")`. **Must re-include Tauri's defaults** (`msWebOOUI,msPdfOOUI,msSmartScreenProtection`) since the call replaces rather than appends. This is the same call site where `--remote-debugging-port` goes for the Windows CDP visual workflow (§8) — one place, two uses |
| macOS    | nothing to suppress; WKWebView never bridged. Just stop setting `navigator.mediaSession.*`                                                                                                                                                                                                                                                                                                |

`useMediaSession.ts` + `components/player/MediaSessionSync/` become a thin
`invoke('media_controls_update', …)` shim — the React tree is structurally identical.
Windows taskbar progress moves from `win.setProgressBar` to `Window::set_progress_bar`.
Budget for souvlaki's open gaps: #67 (Windows display name), #70 (macOS metadata/events),
#77 (macOS panic in **debug** builds only — release is fine; expect it during development).

### 2.8 Boot order (load-bearing)

1. `platform::hydrate_login_path()` — single-threaded, before anything spawns.
2. `tauri_plugin_single_instance::init` — **registered first** (plugin requirement, and two
   instances racing `shiranami.db` / the settings file is a data-loss bug).
3. Sentry: read consent **before** `tauri::Builder`; skip `.plugin(sentry)` entirely when consent
   is absent (the plugin auto-injects browser Sentry — a no-op DSN is not enough). `minidump::init`
   ordering matters: everything before it runs in _both_ processes.
4. Remaining plugins: deep-link (after single-instance), dialog, updater, opener, notification.
5. `setup()`, wrapped in a **`BootTimer`** that stamps each phase and logs total + slowest at INFO:
   logging → settings → **first-run data continuity (§3)** → DB backup → DB adopt+migrate →
   stream server → managed state → window.
6. **Off the setup hook** via `spawn_boot_reconcile`: download-queue hydrate/resume, album-art
   orphan prune, background recommendation refresh (30 s delay, coalesced), scrobbler start,
   updater first check (5 s). None has a first-paint dependency.
7. `SHIRANAMI_E2E=1` continues to disable tray, Discord, updater, and media controls.

### 2.9 The C++ ladder

> **Decision:** rewrite `apps/desktop/src/native/**` fully in Rust (`symphonia` + `ebur128`,
> `realfft` for BPM post-v2) and delete node-gyp, `binding.gyp`, the vendored dr_libs/libebur128,
> and both worker hosts. The inventory leaned toward keeping the napi-free `core/` layer alive
> through the `cc` crate to preserve the user's C++ learning investment.

Rationale: the `cc` route preserves node-gyp's single worst property — a second toolchain on two
CI platforms — for no functional gain, while `symphonia` decodes strictly more formats than
dr_libs (which lets us delete the ffmpeg `loudnorm` fallback entirely), and `ebur128` is a port
of the very library already vendored, so results match. The three-rung ladder survives intact as
a **Rust** ladder — peaks → LUFS → BPM — with identical DSP content; only the language of the
exercise changes. **This is the one decision here with a personal-goals dimension rather than a
purely technical one; it is the user's to veto.** Escape hatch preserved: keep
`shiranami-audio`'s public API FFI-shaped so a `cc`-built C++ core could be swapped in behind it
without touching callers.

> **Decision:** waveform peaks stay a plain `invoke` returning `Vec<f32>`, **not** a
> `tauri::ipc::Channel` + `InvokeResponseBody::Raw` stream. Nightcore's lesson names peaks as a
> Channel candidate, but a bucket array is ≤1,024 f32 (~8 KB), one-shot, and disk-cached; a
> Channel buys nothing and breaks the invoke-shaped shim contract. Reserve Channel+Raw for any
> future PCM/analyser frame stream.

---

## 3. Data continuity plan

### 3.1 Directories

Tauri derives app dirs from the **bundle identifier**, not the product name:

|         | Electron (v1)                             | Tauri (v2)                                             |
| ------- | ----------------------------------------- | ------------------------------------------------------ |
| macOS   | `~/Library/Application Support/Shiranami` | `~/Library/Application Support/com.shironex.shiranami` |
| Windows | `%APPDATA%\Shiranami`                     | `%APPDATA%\com.shironex.shiranami`                     |

> **Decision:** move to the Tauri-native directory and **copy** the v1 tree on first run. Never
> move, never delete. Copy semantics keep v1 bootable, which is the whole safety net behind the
> update handover (§4) — a user who reinstalls v1 must not find an empty app.

First-run sequence (`setup.rs`, before the DB is opened for writing):

1. Detect legacy dir; skip everything if `migrated_from_v1.json` exists in the Tauri dir.
2. **Back up `shiranami.db` first** (port `services/db-backup.ts`'s rotation), into the _legacy_
   backups dir, before anything is touched.
3. Copy: `shiranami.db` (+ `-wal`, `-shm`), `backups/`, `album-art/`, `waveform-peaks/`,
   `bin/{yt-dlp,ffmpeg,ffprobe}`, `logs/`, `config.json`.
4. Import `config.json` → the v2 settings file, key-by-key (§3.4).
5. Import `renderer-state.json` if the v1.x bridge release wrote one (§3.5).
6. Write `migrated_from_v1.json` `{ from, copied_bytes, at, v1_version }`.
7. **On any failure: refuse to start with a clear, actionable error.** Never "helpfully" continue
   into a fresh empty DB — that is the "where did my library go?" failure mode.

Disk cost is one duplicated library-metadata DB plus the art/peaks caches; acceptable, and
reclaimable by a later "migration confirmed, remove v1 data" release once telemetry says the
tail has crossed over.

### 3.2 drizzle → sqlx migration ledger

Current: `__drizzle_migrations (id, hash, created_at, name, applied_at)`, `hash` = sha256 of the
joined SQL, 9 migrations `…_baseline` … `…_query_indexes`, embedded as string arrays in JS (they
wouldn't survive asar) with a test diffing them against `drizzle/*/migration.sql`.

sqlx uses `_sqlx_migrations (version, description, installed_on, success, checksum, execution_time)`.

**Adoption, run once, before `sqlx::migrate!()`:**

1. Open the DB. If `__drizzle_migrations` exists **and** `_sqlx_migrations` does not → v1 user.
2. Read the applied set from `__drizzle_migrations`.
3. Create `_sqlx_migrations` and insert a synthetic **success = 1** row for `0001_baseline.sql`
   with the checksum sqlx derives from that file.
4. `0001_baseline.sql` is an **idempotent squash** of drizzle 0000–0008: `CREATE TABLE IF NOT
EXISTS` / `CREATE INDEX IF NOT EXISTS` throughout. Fresh installs run it for real; adopted DBs
   get it stamped. This is why checksum coupling is harmless.
5. **Leave `__drizzle_migrations` in place, untouched** — it is the v1-rollback breadcrumb.
6. From `0002_*.sql` onward, migrations are pure sqlx and drizzle is dead.

**The `sqlite_master` diff test (mandatory, blocks Phase 6):** a Rust test builds DB-A by running
the 9 drizzle migrations through the existing TS path and DB-B by running `0001_baseline.sql`,
then diffs normalised `sqlite_master` (whitespace-collapsed, ordered) between them. Same idea as
the existing `migrate.test.ts`. If they differ, the squash is wrong and adoption would corrupt a
populated DB.

Also preserved bit-for-bit, because the feasibility plan omitted them and the inventory flagged
them as load-bearing:

- `isLegacyUnversionedDb()` + `markBaseline()` — pre-migrator DBs get stamped without DDL.
- `healDiscNumberColumn()` — PRAGMA-guarded `ALTER TABLE` (SQLite has no `ADD COLUMN IF NOT EXISTS`).
- `PRAGMA user_version` as a **compatibility floor, not a migration count**;
  `assertNotDowngrade()` refuses to open a newer DB. Current floor: **8**.

> **Decision:** v2 does not raise the `user_version` floor for the duration of the handover window
> (~6 months, §4). Every v2.0.x migration must be `backwardCompatible` (index-only or additive-
> nullable). A user who rolls back to v1 after adoption must still be able to open their DB —
> otherwise "copy, never move" protects the _file_ but not the _ability to read it_.

`cargo sqlx prepare` → committed `.sqlx/` so CI compiles `query_as!` without a live DB.

### 3.3 Album art hash stability, and the peaks cache

The art cache is content-addressed: `sha256(jpeg_bytes)[0..32].jpg`, produced today by **two**
pipelines that must agree (Electron `nativeImage` in main, `sharp` in the scan utility), at
512 px longest edge / JPEG q85. `tracks.album_art` stores the resulting URL.

Any Rust encoder produces different bytes → different hash → every existing filename becomes
unreproducible.

> **Decision:** do **not** attempt byte-parity with sharp/nativeImage, and do **not** rehash the
> cache. Copy `album-art/` as-is; existing files keep serving because the serve layer looks up by
> the hash already stored in `tracks.album_art`. Regeneration happens **only when the file is
> missing**. Newly extracted covers get Rust-encoder hashes. The single consequence is that a
> cover already cached under v1 and re-extracted under v2 lands in a second file — a few
> duplicated KB, invisible to the user.

> **Decision:** encoder is the `image` crate's JPEG encoder at q85 (+ `fast_image_resize` for the
> 512 px `fit: inside, withoutEnlargement` scale). No `mozjpeg-sys` — its only justification was
> byte-parity, which is now explicitly abandoned, and it reintroduces a C dependency.

Consequently there is exactly **one** art pipeline in v2 (the two-pipeline hazard disappears with
`utilityProcess`), and a golden test pins `resize → encode → hash` against a committed fixture so
the hash function can never drift _within_ v2.

**The waveform peaks cache survives verbatim.** Its key is `sha256(path|mtime|size)[0..32]` —
encoder-independent. Copy `waveform-peaks/` and reuse it. Pin the exact key-string construction
(separator, field order, mtime unit) with a test against a v1-generated fixture filename; the
inventory's LUFS lesson about a stale worker reply resolving the wrong request applies equally to
a mis-keyed cache.

### 3.4 Settings and secrets

> **Decision:** do **not** use `tauri-plugin-store`, which both reports proposed as the
> electron-store replacement. Use nightcore's `core::atomic` JSON store instead. Three reasons:
> (a) the file holds secrets (`scrobble.settings` = Last.fm session key + ListenBrainz token) and
> we need `create_owner_only` **0600 at creation**, including for the temp-file window; (b)
> `quarantine_corrupt` must run before falling back to defaults, or the next write persists
> defaults over recoverable data; (c) `store.onDidChange`-as-event-bus (telemetry consent →
> Sentry, `system.launchAtStartup` → OS login item) needs a Rust-side watcher we control.

The renderer-writable key allowlist (`RENDERER_STORE_KEYS`) becomes a Rust enum; main-only keys
(`discord-rpc-settings`, `downloads.*`, `migrations.albumArtV1`, `scrobble.settings`) are
unreachable from `store_get`/`store_set` by construction, as today.

> **Decision:** secrets stay in the settings file for v2.0; OS keychain / stronghold is deferred
> to post-v2. Moving them during the same release that migrates directories would force every
> user to re-auth Last.fm at exactly the moment we most need the migration to look boring.

### 3.5 Renderer `localStorage`

Electron's Chromium partition, WKWebView's WebKit store, and WebView2's store are three
completely separate origins. `useUIStore`, `useLayoutStore`, `useAccentStore`, `useThemeBgStore`,
`useOnboardingStore`, `useSupportBannerStore` all persist under `shiranami.*` keys and **all
reset** — theme, accent, sidebar layout, grid size, and the onboarding-complete flag, meaning
returning users get re-onboarded on top of a migration.

> **Decision:** the **v1.x bridge release** (§4) dumps every `shiranami.*` localStorage key into
> `renderer-state.json` next to the DB, generalising the store-mirror pattern
> `useSupportBannerStore` already uses. v2 reads it in first-run step 5 and seeds the zustand
> stores before hydration. Belt-and-braces: re-derive `onboardingComplete` from a populated
> library even if the file is absent.

---

## 4. Update handover plan

**This is the project's #1 risk.** `electron-updater` expects electron-builder metadata
(`latest.yml`, `.blockmap`, its own NSIS). It **cannot** install a Tauri artifact, and there is no
supported hand-off mode. Two lived accounts:

- **Fluxzy:** shipped an intermediate Electron release pointing users at a manual download —
  _"months later, users remained on v1 because they never opened the app during the transition
  window."_ Their advice verbatim: _"plan the bridge release before you start, not after."_
- **museeks 0.20.0:** accepted the break; users exported playlists before upgrading and
  re-imported their library after. Also lost output-device selection, Windows drag-and-drop and
  thumbar controls, macOS dock menu, and the tray icon.

> **Decision:** ship a **dormant v2-manifest hook in every remaining v1.x Electron release,
> starting with the next one** — before any v2 code is written. Cutting further v1 releases
> without it is precisely Fluxzy's documented mistake.

### 4.1 The dormant hook (ships in v1.x, inert until we publish a manifest)

| Piece       | Detail                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest    | `v2.json` at a URL we control, **separate from `latest.yml`** so v1's electron-updater never parses it. Fields: `version`, `min_v1_version`, per-platform `{url, sha256, size}`, `enabled`     |
| Poll        | on the existing hourly updater tick; a 404/`enabled:false` is a silent no-op — this is what "dormant" means                                                                                    |
| Data prep   | writes `renderer-state.json` (§3.5) and `v2-handoff.json` (resolved `userData`, DB path, downloads location, v1 version) next to the DB. v1 knows these paths natively; v2 would have to guess |
| Telemetry   | one-time crossover ping, gated on the existing Sentry opt-in, so the v1 tail is **measured, not guessed**                                                                                      |
| Kill switch | `enabled:false` in the manifest halts the rollout instantly without shipping a release                                                                                                         |

### 4.2 Windows — fully automatic

1. v1.x downloads `Shiranami_2.x.y_x64-setup.exe`, verifies its sha256 against the manifest.
2. Spawns it detached in passive mode, then `app.quit()`.
3. The **Tauri NSIS installer** carries an `installerHooks` → `NSIS_HOOK_PREINSTALL` that reads
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{appId}` → `UninstallString` and runs
   the Electron uninstaller with `/S`, so users don't end up with two Shiranamis in Add/Remove
   Programs.
4. v2 boots, runs first-run continuity (§3.1), and the user sees their library.

> **Decision:** Tauri NSIS is configured `installMode: "passive"`, **per-user** (`currentUser`)
> to match today's electron-builder scope (`oneClick:false, allowToChangeInstallationDirectory:true`
> installs per-user). A scope mismatch orphans the old install instead of replacing it.

### 4.3 macOS — modal, not automatic

> **Decision:** no automatic `.app` replacement on macOS. A blocking in-app modal on launch
> ("Shiranami 2.0 is here") linking to the landing-page download, plus a release-notes callout.

Rationale: **v1 has no auto-update on macOS at all today** — `app/updater.ts` disables the updater
on darwin because the app is unsigned. There is no updater to hand over _from_, so there is no
regression, and an unsigned app writing into `/Applications` and re-launching is exactly the kind
of fragile, Gatekeeper-quarantined path that fails silently on user machines. Mac users already
download manually; the modal makes that explicit instead of pretending otherwise. Revisit once the
Developer ID cert lands (~post-v1, per the deferred-signing plan), at which point the
`.app.tar.gz` replacement path becomes worth building.

### 4.4 Supporting measures

- Keep publishing v1.x **security/compat patches for ~6 months** so stragglers are not abandoned;
  this is also why §3.2 freezes the `user_version` floor.
- **Back up the minisign updater keypair out-of-band before the first v2 release.** Losing
  `TAURI_SIGNING_PRIVATE_KEY` means installed v2 users can never be updated again, ever.
- Windows dual-signing order is fixed and encoded in one CI script: build → **Authenticode** →
  **regenerate minisign `.sig`** → publish. Authenticode mutates the bytes and invalidates any
  earlier `.sig`. A post-publish job re-downloads the artifact and verifies both signatures before
  the release leaves draft.

---

## 5. Phase 0 — gating spikes

Both spikes are throwaway code on a `spike/*` branch. Neither merges to `v2`.

### Spike A — macOS WKWebView Web Audio (hard gate on the entire project)

**Build:** bare Tauri shell + unmodified `apps/web` + the axum stream server serving one real
local file, on a Mac running current macOS.

**Measure, in this order:**

| Check                                                                                 | Instrument                                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A1 — audio audibly plays through a deck                                               | ear + `<audio>.currentTime` advancing                                                                                           |
| A2 — **analyser sees energy** (the silent-CORS canary)                                | in-page: `analyser.getByteFrequencyData(buf)`, `sum(buf) > 0` while playing                                                     |
| A3 — deliberately strip `Access-Control-Allow-Origin` and confirm A2 **goes to zero** | proves the canary actually detects the failure (anti-vacuity)                                                                   |
| A4 — EQ band change is _measurable_, not just audible                                 | move one band ±12 dB, assert the analyser magnitude at that band's centre bin moves ≥6 dB                                       |
| A5 — equal-power crossfade produces no dip/clip                                       | record output, check the sum stays within ±1 dB across the fade                                                                 |
| A6 — no gross quality degradation from `createMediaElementSource` on WebKit           | capture the same 10 s through the graph on WKWebView vs Chromium; spectral difference must be within noise, no rolloff/aliasing |
| A7 — `DynamicsCompressor` limiter and biquad coefficients behave as on Chromium       | A/B the same fixtures                                                                                                           |

**GO:** A1–A5 pass and A6/A7 show no audible or spectral regression → proceed to Phase 1.
**NO-GO:** A2 fails and A3 shows it is _not_ a CORS-header problem, **or** A6 shows irrecoverable
degradation → **the port stops here.** The fallback (native Rust playback engine, ~1,474 LOC of
tuned DSP rewritten) gets its own separate spike and its own separate decision; it is not
something to discover halfway through Phase 9.

### Spike B — updater-bridge proof (gates the v1.x bridge release, not the port)

**Build:** on a clean Windows VM, install a **real published v1.x** from GitHub Releases, point
the dormant hook at a test `v2.json`, and run the whole path.

**GO criterion:** twice in a row on a fresh VM, with zero manual steps —
(1) v1 downloads and launches the Tauri installer; (2) `NSIS_HOOK_PREINSTALL` removes the Electron
entry from Add/Remove Programs; (3) v2 installs and launches; (4) v2's first-run continuity
produces a library with **identical track/playlist counts** to v1; (5) v1's data directory is
still intact and a reinstalled v1 still boots against it.
**NO-GO:** any manual step, any count mismatch, or a damaged v1 directory → the Windows path
degrades to the macOS modal treatment and the automatic route is deferred.

### P0-C — baseline measurement (non-gating, blocks the §1.2 table)

Measure v1 installer size, idle RSS with a 5,000-track library, scan-peak RSS, cold-start to first
paint, and process count. Paste into §1.2. Without this the footprint goals are unfalsifiable.

---

## 6. Phased port plan

All work lands on `v2` as **small conventional commits**. Phases are sized for one focused agent
session. "Worktree" phases are safe to run as parallel isolated agents (disjoint file sets);
"Sequential" phases either establish shared foundations or edit shared registration files.

> Isolated agents must be given **relative** paths — an absolute repo path makes them edit the
> main checkout instead of their worktree.

| #      | Phase                            | Scope                                                                                                                                                                                                                                                                   | Depends on                 | Done when                                                                                                                       | Mode                                                                                                                                                      |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | Gating spikes                    | Spike A (WKWebView Web Audio), Spike B (updater bridge), P0-C baselines                                                                                                                                                                                                 | —                          | A: GO recorded with A1–A7 evidence. B: GO or documented degrade                                                                 | **Sequential — gates everything**                                                                                                                         |
| **1**  | Workspace scaffold               | root `Cargo.toml` + `rust-toolchain.toml` + `clippy.toml`; empty crates; `apps/desktop-tauri` shell that loads `apps/web`; `rust-checks` CI job; `lint-meta` Rust text rules                                                                                            | 0                          | `cargo clippy -D warnings` green on 3 OSes; `pnpm tauri:dev` opens the real UI (backend all-mock)                               | **Sequential**                                                                                                                                            |
| **1b** | **v1.x bridge release**          | dormant `v2.json` hook, `renderer-state.json` dump, `v2-handoff.json`, crossover ping, kill switch — **on `master`, in the Electron app**                                                                                                                               | 0 (Spike B)                | shipped in a v1.x release to real users; manifest 404s cleanly                                                                  | **Worktree — independent lane, start immediately**                                                                                                        |
| **2**  | `shiranami-core`                 | models · error enum + wire taxonomy · `paths` (containment, folders-cache, legacy-dir resolution) · `atomic` store · settings schema + key allowlist · notices · sentinel mirror; specta export harness + drift guard + **`--prove`**                                   | 1                          | ported `path-safety`/`folders-cache` TS test vectors pass; drift guard proven to fail when perturbed                            | **Sequential — everything depends on it**                                                                                                                 |
| **3**  | `shiranami-net`                  | reqwest client, `HttpError` (+ `Retry-After`/`x-ratelimit-reset` clamp), `maxBytes`, per-host rate gates, SSRF guard (scheme allowlist + DNS + range classification, CGNAT deliberately allowed)                                                                        | 2                          | ported `url-safety` TS test vectors pass                                                                                        | **Worktree**                                                                                                                                              |
| **4**  | `shiranami-recommendation::core` | pure affinity/similarity/mixes scoring — the warm-up port, zero I/O, fully tested upstream                                                                                                                                                                              | 2                          | existing TS unit tests reproduced in Rust, same fixtures                                                                        | **Worktree**                                                                                                                                              |
| **5**  | `shiranami-audio`                | symphonia decode · `reducePeaks` · `ebur128` LUFS; deletes `binding.gyp`, dr_libs, libebur128, both worker hosts                                                                                                                                                        | 2                          | LUFS within ±0.1 LU of the C++ addon on a fixture set; peaks byte-identical for the same buckets                                | **Worktree**                                                                                                                                              |
| **6**  | `shiranami-db` foundation        | sqlx pool (WAL, `foreign_keys=ON`, `quick_check`) · `0001_baseline.sql` squash · **drizzle→sqlx adoption** · `user_version` floor + downgrade guard · legacy-baseline/heal branches · backup                                                                            | 2                          | **`sqlite_master` diff test green**; adoption is idempotent across 3 runs on a populated fixture DB                             | **Sequential**                                                                                                                                            |
| **7**  | `shiranami-db` repositories      | the 45 db channels' queries: tracks (13), history (6, aggregate SQL), folders (4), playlists (13), smart-playlists (7, rule→SQL + LIKE escape), backup (2). 500-row `inArray` chunking                                                                                  | 6                          | per-repo tests on a seeded fixture DB                                                                                           | **Worktree ×2 lanes** (tracks+history+folders / playlists+smart+backup)                                                                                   |
| **8**  | `shiranami-serve`                | axum: `/audio` (Range/206), `/art` (LRU), `/radio` (revalidated redirects), CORS header set, loopback bind + path token                                                                                                                                                 | 2, 3                       | integration tests hit an ephemeral port; a **missing-CORS-header test** asserts the header is present                           | **Worktree**                                                                                                                                              |
| **9**  | `shiranami-metadata`             | lofty read/write (ID3/Vorbis/MP4) · art extract → resize → q85 → hash → cache · orphan prune · iTunes lookup + title cleaning · enrich batch (concurrency 4, single-slot cancel)                                                                                        | 2, 3                       | art hash golden test; tag round-trip per format; `albumArtist` never falls back to artist                                       | **Worktree**                                                                                                                                              |
| **10** | `shiranami-library`              | scan flat + grouped (`maxDepth 5`, concurrency 16) · cancellation token · progress events · `validate-files` (128) · storage usage by volume                                                                                                                            | 7, 9                       | scans a fixture tree; cancel mid-scan leaves no partial rows; RSS delta logged                                                  | **Worktree**                                                                                                                                              |
| **11** | `shiranami-downloader`           | yt-dlp/ffmpeg managers (download, chmod, xattr, `zip`) · hardened spawn (`--ignore-config`, `appendUrlArg` `--` guard, failure classification) · queue (concurrency 3, pause/resume, batches) + persistence · playlist extraction (YT + Spotify embed scrape + matcher) | 3, 7                       | `spotify-match` fixture reproduced; abort deletes both `<dest>` and `<dest>.part`                                               | **Worktree**                                                                                                                                              |
| **12** | `shiranami-integrations`         | lyrics (local/embedded/LRCLIB + LRU + coalescing) · weather · scrobble (Last.fm md5 signing, ListenBrainz, **persisted** retry queue) · discord (throttle/backoff/dedup) · share (+ server DTOs)                                                                        | 3, 7                       | per-module tests; scrobble secrets never cross the command boundary                                                             | **Worktree ×3 lanes** (lyrics+weather / scrobble / discord+share)                                                                                         |
| **13** | `shiranami-media-controls`       | souvlaki SMTC + `MPNowPlayingInfoCenter` + remote commands; tray with dynamic now-playing menu; autostart; minimize/close-to-tray; taskbar progress                                                                                                                     | 2                          | media keys work on both OSes with the webview session suppressed; only **one** OS entry appears                                 | **Worktree**                                                                                                                                              |
| **14** | Command & event surface          | all 155 channels as `#[tauri::command] #[specta::specta]`, one module per namespace; the 20 events via `collect_events!`; bindings emitted to `packages/contracts/src/generated`                                                                                        | owning crate per namespace | every channel in `ALL_IPC_CHANNELS` has a command; parity checklist 155/155                                                     | **Worktree per namespace** — each agent touches only `commands/<ns>.rs` + appends one line to `bindings.rs`; merge in order to keep that conflict trivial |
| **15** | `apps/web` bridge shim           | `window.electronAPI` over generated bindings: error rehydration, precise idempotent unsubscribe, fallback semantics, `platform`/`__e2e`/code registries, stream-URL helper, `mediaSession` → `invoke` shim, mock mode                                                   | 14                         | `preload-api` conformance test passes against the shim; app is fully usable                                                     | **Sequential**                                                                                                                                            |
| **16** | App shell & boot                 | boot order + `BootTimer` · single-instance · deep links · window/CSP/compact mode · logging · Sentry (consent-gated, minidump) · debug metrics (redesigned on `sysinfo`) · updater plugin                                                                               | 14                         | cold start logged under the §1.2 ceiling; `SHIRANAMI_E2E=1` still disables the right things                                     | **Sequential**                                                                                                                                            |
| **17** | First-run data continuity        | copy-never-move, backup-first, adoption call, `renderer-state.json` seed, marker file, refuse-to-start-on-failure                                                                                                                                                       | 6, 16                      | end-to-end test against a **synthetic v1 profile** (DB + art + peaks + config) produces identical counts; second run is a no-op | **Sequential**                                                                                                                                            |
| **18** | Testing                          | `@wdio/tauri-service` E2E port · the analyser-energy regression test · Windows CDP visual workflow · `:5173` mock-mode target                                                                                                                                           | 15, 16                     | the ported e2e specs (playback, eq, deep-link) pass on macOS and Windows                                                        | **Worktree ×2** (E2E / visual+mock)                                                                                                                       |
| **19** | Packaging & release CI           | `tauri.conf.json` bundle config · updater keypair (**backed up**) · Windows dual-sign script + verify job · Sentry symbol upload · `bump-version` extended to `Cargo.toml` + `tauri.conf.json`                                                                          | 16                         | a draft release builds on both platforms and both signatures verify                                                             | **Sequential**                                                                                                                                            |
| **20** | Cutover                          | rename `desktop-tauri` → `desktop`; freeze/delete `apps/desktop` (Electron), `packages/database`, `packages/recommendation`; flip the `v2.json` manifest `enabled`                                                                                                      | 17, 18, 19                 | v2.0.0 published; crossover telemetry rising                                                                                    | **Sequential**                                                                                                                                            |

### 6.1 CI story

Existing pnpm jobs (lint, typecheck, `apps/web` Vitest, Storybook, landing) are **unchanged**.
Added:

| Job                        | Runner                        | Gates                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rust-checks`              | ubuntu                        | `cargo fmt --check` → `cargo clippy --all-targets -- -D warnings -W clippy::await_holding_lock -W clippy::unwrap_used` → `cargo test --workspace` → `git diff --exit-code packages/contracts/src/generated` → `pnpm verify:drift-guard` |
| `rust-cross-check`         | macos-latest + windows-latest | `cargo check --workspace --all-targets` only. **Required** — souvlaki, taskbar progress, WebView2 args, and `security-framework` are `cfg`-gated, so an ubuntu-only clippy never compiles them                                          |
| `sqlx-offline`             | ubuntu                        | `cargo sqlx prepare --check` so `query_as!` compiles with no live DB                                                                                                                                                                    |
| `lint-meta` (existing job) | ubuntu                        | new **pure-text** Rust rules — `rust-module-shape` (400 code-line cap, `mod.rs` is a manifest), `rust-layer-rank`, `rust-command-placement`. Text scans, never `cargo`, so they need no Tauri system deps                               |
| `audit` (existing)         | ubuntu                        | `+ cargo audit`                                                                                                                                                                                                                         |

Cost controls (R9): `Swatinem/rust-cache` with a distinct slot per job; `[profile.dev]
incremental = true`; `lto`/`codegen-units = 1` **only** in release; `concurrency` group cancels
superseded PR runs. Release builds stay on the tag-triggered workflow only.

Husky: **pre-push** (not pre-commit) runs `cargo fmt --check` + `clippy` + the drift guard — Rust
checks are too slow for pre-commit and DB fixture tests can conflict with a held index lock.

---

## 7. Risk register

Merged and deduped across all three reports. "Retired in" = the phase whose done-criteria prove
the risk is closed.

| ID      | Risk                                                                                           | P×I            | Mitigation                                                                                                                                                                                                                      | Retired in    |
| ------- | ---------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **R1**  | electron-updater → Tauri handover strands users on v1                                          | 🔴 H×H         | Dormant hook in every v1.x release (§4.1); automatic Windows path with NSIS preinstall uninstall; macOS modal; copy-never-move data; 6-month v1 patches; frozen `user_version` floor; crossover telemetry to _measure_ the tail | 1b + 20       |
| **R2**  | WKWebView Web Audio differs from Chromium (silent on CORS; `MediaElementSource` quality)       | 🔴 M-H×H       | Spike A with an explicit anti-vacuity check (A3); loopback server owns the CORS headers; permanent analyser-energy E2E test                                                                                                     | 0 (gate) + 18 |
| **R3**  | wry#1778 — macOS 26.6 drops cross-scheme subresources                                          | 🟠 H×M         | Loopback HTTP for audio **and** art; no custom scheme anywhere. Track the issue; the scheme route returns as an optimisation if fixed                                                                                           | 8             |
| **R4**  | Windows SMTC shows "Microsoft Edge WebView2"                                                   | 🟠 Certain×M   | souvlaki from day one + webview media session suppressed via browser args; budget souvlaki #67/#70/#77                                                                                                                          | 13            |
| **R5**  | E2E suite dies; macOS CDP visual testing dies                                                  | 🟠 Certain×M   | `@wdio/tauri-service` (embedded WebDriver is the only macOS option); CDP visual workflow moves to WebView2/Windows; `:5173` mock mode for component checks; Storybook unaffected                                                | 18            |
| **R6**  | Silent data loss — wrong directory, or non-idempotent ledger adoption re-runs baseline DDL     | 🔴 M×H         | Idempotent squash; `sqlite_master` diff test; backup-before-touch; `migrated_from_v1` marker; **refuse to start** rather than create an empty DB                                                                                | 6 + 17        |
| **R7**  | Renderer `localStorage` resets — users get re-onboarded                                        | 🟡 Certain×L-M | v1.x bridge dumps `shiranami.*` to `renderer-state.json`; v2 seeds zustand pre-hydration; re-derive `onboardingComplete` from a populated library                                                                               | 1b + 17       |
| **R8**  | Windows Authenticode invalidates the minisign `.sig`                                           | 🟡 M×M         | One CI script fixes the order (build → Authenticode → re-minisign → publish); post-publish verify job; `rust-toolchain.toml` pins against rustup host drift                                                                     | 19            |
| **R9**  | Rust build times / CI cost                                                                     | 🟡 Certain×L-M | Workspace splits the rebuild surface; rust-cache per job; dev incremental; release-only LTO; cancel superseded runs                                                                                                             | 1             |
| **R10** | Rust learning curve on ownership-heavy code                                                    | 🟡 M×M         | Port order is deliberately graded: pure scoring (4) → known DSP (5) → mechanical SQL (6/7) → I/O-heavy (9–12) → wiring last                                                                                                     | 4→12          |
| **R11** | `tauri-specta` is perpetually pre-1.0                                                          | 🟢 L-M×L       | Exact `=2.0.0-rc.25` pin (as nuclear ships); generated output lives behind `@shiranami/contracts`, so a swap to stable `ts-rs` touches ~1 file + a hand-written invoke wrapper                                                  | 2             |
| **R12** | Tauri v3 churn                                                                                 | 🟢 L×L         | v3 is driven by GTK3→GTK4 on Linux, which we don't ship. Note and move on                                                                                                                                                       | —             |
| **R13** | Unplanned feature regressions in aggregate (museeks lost 6+ features)                          | 🟡 M×L each    | The 155-channel manifest **is** the parity checklist; 155/155 is a Phase 14 done-criterion. Known accepted losses: debug-panel shape (#31), output-device selection (never had it)                                              | 14            |
| **R14** | Album-art hash change invalidates the cache / breaks `tracks.album_art`                        | 🟡 Certain×L   | Parity explicitly abandoned; copy files, serve by stored hash, regenerate only when missing; golden test pins v2's own hash function                                                                                            | 9 + 17        |
| **R15** | Sync `#[tauri::command]` freezes the UI on the WKWebView main thread                           | 🟠 M×M         | All commands `async` + `spawn_blocking`; `SYNC_COMMAND_ALLOWLIST` ratchet test                                                                                                                                                  | 14            |
| **R16** | Bare `tokio::spawn` from a sync/callback thread → SIGABRT across the extern-"C" boundary       | 🟠 L×H         | `tauri::async_runtime::spawn` only; source-grep regression test                                                                                                                                                                 | 2             |
| **R17** | Drift guard silently becomes a no-op (nightcore #422 — vacuous for its entire life)            | 🟠 M×H         | Export path is a compile-time constant, not env-derived; `verify:drift-guard` perturbs a type and **requires failure**                                                                                                          | 2             |
| **R18** | Boot-order regressions (Sentry after ready, migrations before backup, queue hydrate before DB) | 🟡 M×M         | Ordering is documented in §2.8, stamped by `BootTimer`, and asserted by a setup-sequence test                                                                                                                                   | 16            |
| **R19** | macOS Finder launch has a minimal PATH → ffmpeg fallback and yt-dlp fail                       | 🟡 M×M         | `fix-path-env-rs` + `hydrate_login_path()` single-threaded at startup                                                                                                                                                           | 16            |
| **R20** | Orphaned child processes (yt-dlp/ffmpeg) on abnormal exit, especially Windows                  | 🟡 M×L         | `kill_on_drop(true)` on every child + an `ExitRequested` sweep                                                                                                                                                                  | 11            |
| **R21** | Two instances race the DB / settings file                                                      | 🟡 L×H         | `tauri-plugin-single-instance` registered **first**; second instance focuses the existing window                                                                                                                                | 16            |
| **R22** | Secrets sit in plaintext JSON                                                                  | 🟡 Certain×M   | `create_owner_only` 0600 at creation (incl. the temp-file window) for v2.0; keychain deferred post-v2 with a deliberate rationale (§3.4)                                                                                        | 2             |
| **R23** | `apps/server` share-DTO coupling / paused `apps/mobile` broken by the contracts rewrite        | 🟡 M×M         | Share DTOs stay hand-written zod in `packages/contracts`, **not** generated; a contracts-import smoke build for mobile stays in CI                                                                                              | 14            |
| **R24** | High-frequency events flood the webview (scan/download progress)                               | 🟢 M×L         | Keep the 250 ms throttle + immediate-on-structural-change; coalescing pump; `RawValue` single-serialization for emit+persist paths                                                                                              | 10, 11        |

---

## 8. Testing strategy

Four rings plus the contract guard. Nothing here bridges test runners: Vitest for `apps/web`,
`cargo test` for crates, WebdriverIO for E2E.

| Ring                     | Tool                                                       | Covers                                                                             | Notes                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 — unit/integration** | `cargo test` per crate                                     | scoring, DSP, SQL, path/URL safety, Range server, tag round-trips, ledger adoption | No webview. Golden fixtures for art hash, peaks cache key, `sqlite_master`, `spotify-match`                                                                                          |
| **2 — command-level**    | `tauri::test` MockRuntime                                  | commands + managed state + event emission, in-process                              | Cheap; run in `rust-checks`                                                                                                                                                          |
| **3 — E2E**              | **`@wdio/tauri-service`**                                  | the ported `apps/desktop/e2e/*.spec.ts` scenarios (playback, eq, deep-link)        | Playwright's `_electron.launch` has **no** Tauri equivalent. `tauri-driver` direct is Windows/Linux only; wdio's **embedded** WebDriver server is the only thing that works on macOS |
| **4 — visual/UI**        | Playwright at `:5173` mock mode + Storybook `addon-vitest` | component and layout checks                                                        | Already the working pattern for nightcore; the shim's mock path (§2.6) is what enables it                                                                                            |

**Windows CDP visual checks.** The `dev:inspect` CDP-over-9222 workflow is Chromium-only, so it
dies on macOS (WKWebView has no CDP — already learned on nightcore). It survives on **Windows**:
WebView2 accepts `--remote-debugging-port` through `with_additional_browser_args`, and Playwright
`connectOverCDP` attaches as today. Same call site as the media-session suppression flags (§2.7) —
keep both in one function so the default-args replacement footgun is handled once.

**The two permanent regression tests that pay for themselves:**

1. **Analyser-energy test** (Ring 3, both OSes): play a fixture, assert
   `sum(analyser.getByteFrequencyData()) > 0`. This is the _only_ automated detector of the
   silent-on-CORS failure, whose symptom is otherwise "the visualiser looks broken" reported by a
   user weeks later.
2. **Contract-drift guard** (`rust-checks`): `cargo test` regenerates bindings → `git diff
--exit-code` → **`verify:drift-guard` perturbs a `specta::Type` and requires the battery to
   fail.** A guard that silently no-ops is worse than no guard; nightcore's was vacuous for its
   entire life until issue #422.

Coverage floors are **ratchets** — raise, never lower — per tier (web / rust). `--frozen-lockfile`
and a committed `Cargo.lock` double as lockfile-drift guards.

---

## Appendix A — decision index

| #   | Decision                                                                                                                                            | §     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| D1  | Full Rust port; no TS sidecar, ever (spawn-per-call if one is ever unavoidable)                                                                     | 1     |
| D2  | Audio engine stays in the renderer; Rust is a byte server                                                                                           | 1.1   |
| D3  | Cargo workspace of domain crates, not nightcore's single crate — but adopt its file-size/`mod.rs` rules from day one                                | 2.1   |
| D4  | `shiranami-serve` is a crate, not `src-tauri/src/stream_server.rs`                                                                                  | 2.1   |
| D5  | Loopback axum HTTP server for audio + art + radio; no custom URI scheme, no asset protocol                                                          | 2.4   |
| D6  | `tauri-specta` `=2.0.0-rc.25` over plain `ts-rs`, because 155 channels need typed callables, not just types; `ts-rs` documented as the escape hatch | 2.5   |
| D7  | Keep nightcore's regenerate-and-diff guard **and** the `--prove` anti-vacuity prover; export path is a compile-time constant, not env-derived       | 2.5   |
| D8  | Renderer keeps `window.electronAPI` (inventory is authoritative over the feasibility report's `window.shiranami`)                                   | 2.6   |
| D9  | Delete the `__IPC_ERROR__` sentinel server-side; the shim reconstructs the same renderer-visible error shape                                        | 2.6   |
| D10 | souvlaki from day one; suppress the webview media session (Windows browser args; macOS n/a)                                                         | 2.7   |
| D11 | Rewrite the C++ addon fully in Rust; the ladder becomes a Rust ladder — _user's call to veto_                                                       | 2.9   |
| D12 | Waveform peaks stay a plain `invoke`, not a `tauri::ipc::Channel` raw stream                                                                        | 2.9   |
| D13 | Move to the Tauri-native data dir; **copy, never move**; refuse to start on migration failure                                                       | 3.1   |
| D14 | Idempotent `0001_baseline` squash + synthetic `_sqlx_migrations` row; leave `__drizzle_migrations` in place                                         | 3.2   |
| D15 | Freeze the `PRAGMA user_version` floor for the ~6-month handover window                                                                             | 3.2   |
| D16 | Abandon art-hash parity; copy the cache, serve by stored hash, regenerate only when missing; `image` crate q85, no mozjpeg                          | 3.3   |
| D17 | `core::atomic` JSON store instead of `tauri-plugin-store` (0600 secrets, quarantine, change-bus)                                                    | 3.4   |
| D18 | Secrets stay in the settings file for v2.0; keychain post-v2                                                                                        | 3.4   |
| D19 | v1.x bridge release dumps `localStorage` to `renderer-state.json`                                                                                   | 3.5   |
| D20 | Dormant v2-manifest hook ships in v1.x **before** any v2 code                                                                                       | 4     |
| D21 | Windows handover is fully automatic (NSIS `passive`, per-user, preinstall uninstall hook)                                                           | 4.2   |
| D22 | macOS handover is a blocking modal, not automatic `.app` replacement (v1 has no macOS updater anyway)                                               | 4.3   |
| D23 | Spike A is a hard gate on the whole project; Spike B gates only the v1.x bridge release                                                             | 5     |
| D24 | Required `cargo check` legs on macOS + Windows so `cfg`-gated code is always compiled                                                               | 6.1   |
| D25 | Share DTOs stay hand-written zod (server + paused mobile depend on them), not generated                                                             | 7/R23 |

## Appendix B — pinned dependencies (health-checked 2026-08-01)

```toml
tauri = { version = "2.11", features = ["tray-icon", "image-png"] }
tauri-plugin-updater = "2.10"      tauri-plugin-single-instance = "2.4"
tauri-plugin-deep-link = "2.4"     tauri-plugin-global-shortcut = "2.3"   # escape hatch only
tauri-plugin-notification = "2.3"  tauri-plugin-dialog = "2.7"
tauri-plugin-opener = "2.5"        tauri-plugin-os = "2.3"
tauri-plugin-autostart = "2"       tauri-plugin-sentry = "0.5"   sentry = "0.49"

sqlx      = { version = "0.9", features = ["runtime-tokio","sqlite","macros","migrate"] }
symphonia = { version = "0.6", features = ["mp3","flac","isomp4","aac","opt-simd"] }
ebur128 = "0.1.10"   realfft = "3.5"        lofty = "0.24"
image = "0.25"       fast_image_resize = "6.1"
axum = "0.8"         tokio-util = "0.7"     reqwest = "0.13"   # rustls, feature-unified with the updater
walkdir = "2.5"      notify = "8.2"         rayon = "1.12"     zip = "8.6"
souvlaki = "0.8"     discord-rich-presence = "1.1"             governor = "0.10"
thiserror = "2"      tracing + tracing-appender             sysinfo = "0.38"
specta = "=2.0.0-rc.25"  specta-typescript = "0.0.12"  tauri-specta = "=2.0.0-rc.25"
fix-path-env = { git = "https://github.com/tauri-apps/fix-path-env-rs" }
```

**Avoid:** `aubio-rs`/`aubio`/`beat-detector`/`essentia-rs` (all abandoned 2021–2024),
`tauri-plugin-media` (21★), `tauri-plugin-media-toolkit` (66 downloads), `sentry-tauri` 0.3.1
(superseded), `tauri-plugin-sql` (puts SQL in the renderer — wrong layer), `tauri-plugin-store`
(D17), `mozjpeg-sys` (D16), any forked `tao` patch (musicat's cautionary tale).

## Appendix C — reference implementations, in reading order

1. **`nukeop/nuclear`** — `packages/player/src-tauri/`: `stream_server.rs`, `ytdlp_setup.rs`,
   `db.rs`, `discord.rs`, `Cargo.toml`. Electron→Tauri music player, 18k★, closest twin;
   `packages/hifi` is TypeScript Web Audio — proof the webview-audio strategy scales.
2. **`martpie/museeks`** — `src-tauri/src/plugins/stream_server.rs` (Range impl with the _why_
   comment), `libs/database.rs` (sqlx), `migrations/*.sql`; discussion #813 for the migration retro.
3. **Fluxzy blog** — the only honest account of a failed updater bridge, plus Windows dual-signing.
4. **`nightcore`** (in-house) — `src/store/atomic.rs`, `src/sync.rs`, `src/infra/logging.rs`,
   `src/arch_guards.rs`, `scripts/verify-drift-guard.ts`, `apps/web/src/lib/bridge/`.
5. **`timfish/sentry-tauri`** — plugin README + `sentry-rust-minidump`.
6. **`basharovV/musicat`** — read _only_ if D2 is ever reopened.

## Post-approval decisions (2026-08-01)

- Approved: full Rust rewrite of the C++ native addon (waveform/LUFS via symphonia + ebur128); the FFI escape hatch is not needed.
- Spike B (Windows updater-handover proof on a VM) is replaced by the user testing the v2 branch on their Windows PC before v2 launch. The dormant v1.x bridge hook (Phase 1b) still ships early on the 1.x line.
- Phase 1 (scaffold) runs in parallel with Spike A; port phases 2+ remain gated on Spike A passing.

## Phase 1b implementation amendments (2026-08-01, PR #364)

Recorded from the shipped `feat/updater-v2-bridge` branch where the implementation deviated from §4; these supersede the original text.

- **Own timers, shared cadence.** The bridge does not ride the electron-updater tick — that tick never runs on macOS (unsigned build returns early) or in dev, which would have made the macOS handover modal unreachable. The bridge schedules its own `unref`'d timers (+5s first check, then hourly) importing `INITIAL_UPDATE_CHECK_DELAY_MS` / `UPDATE_CHECK_INTERVAL_MS` from `updater.ts`.
- **localStorage dump via `webContents.executeJavaScript`** scoped to the `shiranami.` prefix — zero renderer diff (no new IPC channel, preload entry, or React surface frozen into the sunsetting v1 app).
- **Handover prompt is a window-modal `dialog.showMessageBox`**, not a React modal, for the same zero-renderer-diff reason.
- **Manifest gains an optional `download_page` field** so macOS points at the landing page rather than the artifact; absent ⇒ fall back to the platform URL. Per-platform `{url, sha256, size}` unchanged.
- **Manifest fetch uses native `fetch`, not `app/http.ts`** — the shared helper warns on every non-2xx, which would log daily forever in the dormant state. The installer download still goes through `app/http.ts`.
- **Dormant guard:** `fetchV2Manifest()` returns `null` (never throws) for 404/non-2xx/network/timeout/oversized/malformed/schema-invalid; `resolveHandover()` returns `null` on kill switch, unmet `min_v1_version`, or missing platform artifact. One info log per process, no renderer contact, no Sentry.
- New main-only store key `v2.crossoverPinged` (deliberately not in `RENDERER_STORE_KEYS`); version comparison extracted to dependency-free `utils/version.ts`.
