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

## Spike A result (2026-08-01): PASS — port phases unblocked

Full evidence in [spike-a-results.md](./spike-a-results.md) (macOS 26.5.1, WebKit 21624.2.5.11.4, Tauri 2.11.5). Load-bearing requirements it adds:

- The v2 stream server MUST always send `Access-Control-Allow-Origin: *` and implement RFC-7233 single-range 206 responses — WebKit opens every media load with a `Range: bytes=0-1` probe, so Range support is load-bearing for playback, not just seeking.
- Keep `crossOrigin='anonymous'` on media elements so a missing-header regression fails loudly (MediaError 4) instead of the silent zero-samples trap.
- No autoplay configuration needed on Tauri/WKWebView (unlike Electron's `autoplay-policy` switch) — keep wry defaults.
- CORS `Origin` arrives as literal `tauri://localhost`; fine for `*`, matters if the server ever goes credentialed.
- WKWebView audio contexts run at 48 kHz with transparent resampling of 44.1 kHz media.
- `navigator.mediaSession` accepts metadata/handlers/playbackState without error; actual Now Playing + media-key surfacing still needs a short manual check before D-media-controls is considered settled (souvlaki remains the plan of record).

## Phase 3–5 implementation amendments (2026-08-01, merged to v2)

Recorded from the shipped `v2-net`, `v2-recommendation`, and `v2-audio` lanes; full rationale lives in the crates' module docs.

**Phase 3 (`shiranami-net`):**

- `governor` (Appendix B) is deliberately unused — GCRA paces arrivals not completions, loses FIFO order, and cannot be pushed forward by an external `Retry-After`; the ported `MinIntervalGate` is hand-rolled. The pin remains for a future true token-bucket need.
- `ipaddr.js` range names became explicit CIDR tables (verified non-overlapping; a boundary test caught a dropped multicast row in the port).
- The client sets a `User-Agent` (`shiranami/<version>`) — reqwest sends none and api.github.com 403s without one; v1 rode Chromium's UA invisibly.
- Non-2xx responses are returned and logged at `debug`, never `warn` (Phase 1b lesson applied to v2). All `HttpError` variants map to core's frozen `INTERNAL` code; higher crates wrap for user-meaningful registry entries.
- The SSRF guard stays opt-in per request (`RequestOptions::guarded()`), matching v1's two untrusted-URL call sites; `shiranami-serve` gets the shared instance for hop-by-hop revalidation in Phase 8.

**Phase 4 (`shiranami-recommendation`):**

- ISO-8601 parsing is a hand-rolled module (`core/instant.rs`) cross-checked against V8 `Date.parse` (five divergences found and fixed; two legacy V8 behaviours deliberately unmatched and pinned by tests). Offset-less date-times read as UTC. **Move to `shiranami-core` when a second consumer appears** (Phase 12 scrobble timestamps / shelf TTL are candidates).
- Golden-vector differential vs the TS package: bit-identical orderings and similarity/mix scores; 5 of 90 affinity scores differ by one ULP (`Math.pow` vs `f64::powf`); asserted tolerance 1e-15.

**Phase 5 (`shiranami-audio`):**

- Appendix B additions: symphonia `alac` feature (iTunes `.m4a` rips are ALAC) and `sha2 0.10` (the §3.3 cache key is a compatibility constraint).
- Verified against a compiled harness of v1's own C++ core: peaks bit-identical (wav/flac), LUFS within 2.1e-14 LU (0.0063 LU on mp3 where decoders differ), cache filenames and bytes reproduced exactly. ~1.4× faster than the addon, O(1) memory.
- Format coverage vs v1: gains `.m4a` (AAC+ALAC), `.ogg`, and mislabelled extensions; residual gap `.opus`/`.wma` — both were ffmpeg-fallback-only in v1, never native. Pinned by tests that fail when symphonia closes them.
- The ffmpeg `loudnorm` fallback is deleted; undecodable is a real error surfaced to the caller.

## Phase 6 implementation amendments (2026-08-01, merged to v2)

Recorded from the shipped `shiranami-db` foundation; full rationale lives in the crate's module docs.

**Pool.** v1's effective settings were WAL + `foreign_keys=ON` (explicit in `client.ts`) plus
better-sqlite3's defaults for `busy_timeout` (5000 ms) and `synchronous` (`FULL`); all four are set
explicitly in v2 and pinned by a test. The pool holds **one connection**, matching v1's single
synchronous handle — this removes the `SQLITE_BUSY_SNAPSHOT` class outright, since sqlx opens
_deferred_ transactions and `busy_timeout` does not retry a failed snapshot upgrade. Phase 7 must
therefore never acquire a second connection while holding one; raising the count later requires
`BEGIN IMMEDIATE` on every write path.

**`quick_check` is fatal, not advisory.** v1 logged a warning and opened the file anyway, on the
reasoning that a half-readable database is still worth exporting from. v2's caller is first-run
adoption, which is about to write a ledger into the file. Any `SQLITE_CORRUPT` — including from the
connect itself, which is where a badly mangled file actually fails — maps to the same error.

**Adoption states.** Beyond §3.2's list: a ledger recording the baseline as applied against a
database with no `tracks` table is refused, and a `_sqlx_migrations` table with no baseline row
counts as "not yet adopted" (a crashed first run is resumable, not a conflict).

**drizzle 0.x ledgers are refused, not upgraded.** The 3-column shape would need drizzle's own
hash-matching upgrade path. It is unreachable: v1's migrator landed in v0.22.0 (`9c0d0564`) and the
bump to drizzle 1.0.0-rc.2 landed before v0.19.0 (`173f5832`), so every ledger in the wild is the
5-column shape. Detected and refused rather than guessed at.

**`ALTER TABLE ... ADD` is guarded generally**, not just for `disc_number`. v1 ran migrations 001/002
unguarded, which is safe when the only inputs are databases v1 produced; adoption's input is wider.
Statement-shape matched, with a test pinning exactly which two frozen statements it recognises.

**Fresh v2 installs seed a complete `__drizzle_migrations` ledger.** §3.2 step 5 only says to leave an
existing one in place. Writing one on fresh installs too closes the other direction of the handover:
v1's `importDatabase` accepts any file at the frozen floor, and would then hand a v2-created database
to its own migrator, which would replay `ALTER TABLE tracks ADD album_artist` against a column that
already exists and fail. drizzle rc.2 selects pending migrations by **name-set membership** (not by
newest `created_at`, as `migrate.test.ts`'s comment still claims), so the rows are enough. Removable
once the handover window closes.

**`user_version` is stamped inside the adoption transaction**, unlike v1, which stamped after its
migrator returned. The pragma is transactional, so the stamp and the ledger it describes commit
together.

**Legacy-created databases keep v1's schema _text_.** The pre-migrator `createTables()` DDL differs
textually from the drizzle baseline (unquoted identifiers, `NOT NULL DEFAULT` ordering, inline
`REFERENCES`), and adoption does not rewrite it — neither did v1. Equivalence there is structural
(every table, column and index present), which is what named-column queries depend on. The
`sqlite_master` text proof covers the drizzle-created schema, which is what a fresh install produces.
A healed `tracks` also carries `disc_number` last rather than mid-table, because `ALTER TABLE`
appends; v1 produces the same shape.

**The `sqlite_master` diff test is fixture-based, and the fixture has its own guard.**
`crates/shiranami-db/fixtures/v1-schema.json` is generated from `packages/database/drizzle/*` by
`pnpm verify:db-baseline` and committed, because `packages/database` is deleted at cutover (Phase 20)
and the cargo test has to keep working afterwards. The script's verifying mode is wired into
`rust-checks`, not `ci.yml` — that job already installs Node for `verify:drift-guard`, and the script
uses `node:sqlite` and no `node_modules`. It derives the `user_version` floor from `migrate.ts`
rather than hardcoding it, so a v1 that raised its floor fails the check instead of silently
diverging. Proven non-vacuous by perturbing a v1 migration and requiring exit 1.

**Appendix B pin.** `sqlx = "0.9"` with `default-features = false`. 0.9 gates dynamic SQL behind
`SqlSafeStr`, so the handful of statements that interpolate a private constant are wrapped in
`AssertSqlSafe` with the audit note the trait asks for. `macros` is pinned per Appendix B but unused
until Phase 7, so no `.sqlx/` offline data or `sqlx-offline` CI job is needed yet.

## Phase 7–8 implementation amendments (2026-08-01, merged to v2)

**Phase 7 (`shiranami-db` repositories, two lanes):**

- **Calling convention (coordinator ruling):** the two lanes landed with opposite conventions — lane B repositories borrow `&mut SqliteConnection` acquired at the command boundary; lane A public functions acquired from the pool internally. Mixed, this deadlocks the single-connection pool (a command holding lane B's connection calling a lane-A function). The unified rule, now in `repo/mod.rs`: **every repository function takes `&mut SqliteConnection`; `conn::acquire` is the crate's only acquire site; the command layer acquires once.** Lane A's functions are being converted to match before Phase 14 builds on them.
- No albums/artists repositories exist — v1 derives both client-side by grouping tracks (`apps/web/src/lib/albumSort.ts`); nothing was invented.
- Runtime sqlx API, not `query_as!` macros — `.sqlx/` offline data and its CI job are a coordinator decision deferred to Phase 14.
- Timestamps are minted by SQLite's clock (`strftime`, byte-identical to `toISOString()`, pinned by test); `history::record_play` and `radio::add` deliberately keep v1's divergent timestamp formats.
- History wire types were added to `shiranami-core` models (they lived in `contracts/src/ipc/`, which Phase 2 didn't port).
- `VACUUM INTO` replaces better-sqlite3's online-backup API (same consistency; defragments; refuses existing destinations).
- Scrobble-queue persistence is Phase 12's to design — v1's queue is process-memory only. Lyrics and storage-usage likewise have no v1 DB layer (files/statfs; Phases 12/10).
- The rule→SQL compiler covers all 56 field×operator combinations via `QueryBuilder` binds only; injection attempts pinned as operands.
- A real v1 bug was fixed in port: julian-day→ms scaling made an exactly-30-minute gap measure as 1800000.00004 ms, splitting listening sessions; now epoch-subtracted, integer-rounded, boundary pinned.

**Phase 8 (`shiranami-serve`):**

- `Access-Control-Allow-Origin: *` (Spike A amendment) supersedes §2.4's "webview origin" — asserted on every media route including all 9 refusal paths.
- `HttpClient::stream()` (redirect-less streaming primitive) was added to `shiranami-net` so net remains the sole reqwest constructor; serve drives the ≤5-hop loop with the SSRF guard re-run per hop.
- v1's 499-on-abort is dropped — over HTTP the client's gone; abort propagates by dropping the upstream body.
- RFC-7233 conformance over v1 bug parity (suffix ranges, end clamping, 416 — v1 had none). Art path traversal is refused, never `basename`d.
- Media-type tables live in serve (sole consumer) with a drift test against the frozen v1 table; v1's TWO distinct audio MIME fallbacks are preserved (typeless radio → `audio/mpeg`; unknown file extension → `application/octet-stream`).
- Loopback auth: 32-byte CSPRNG hex path token minted in `start()`, constant-time compared, wrong token = blanket 404 (a 403 would confirm the server to a local prober).

## Phase 9 implementation amendments (2026-08-01, merged to v2)

Recorded from the shipped `shiranami-metadata` lane; full rationale lives in the crate's module docs.

**The album-art hash verdict (R14, D16) is now measured, and it is stronger than the plan assumed.**
§3.3 decided against byte-parity on the reasoning that "any Rust encoder produces different bytes".
Porting turned up a better reason: **v1 has no single canonical output to be compatible with.** It
ships _two_ art pipelines writing into one content-addressed directory — Electron `nativeImage`
(Chromium/Skia) in the main process, and `sharp` (libvips/libjpeg-turbo) in the scan utility, which
exists only because `nativeImage` is unavailable inside a `utilityProcess`.
`scripts/verify-art-baseline.mjs` runs **both, the real ones**, over four committed covers:

|                                               | Result                 |
| --------------------------------------------- | ---------------------- |
| Geometry agreement between v1's two pipelines | **4 of 4**             |
| Hash agreement between v1's two pipelines     | **0 of 4**             |
| v2 geometry vs both v1 pipelines              | **4 of 4 identical**   |
| v2 bytes vs either v1 pipeline                | differ, as D16 intends |

So the same cover already lands under two different filenames in v1 depending on whether the track
arrived through a library scan or a metadata write. "Match v1's bytes" is not a hard target; it is an
ill-defined one, and D16 needs no revisiting. v2 reproduces everything that _is_ well defined — the
512 px `fit: inside, withoutEnlargement` geometry (including the `max(1, round(…))` floor), q85,
`sha256(encoded)[0..32].jpg`, the `shiranami-art://art/` URL, and the create-exclusive write whose
`EEXIST` is the dedupe happy path. `tests/art_v1_compat.rs` asserts all of it against the fixture and
fails loudly if v1's two pipelines ever _agree_; `tests/art_golden.rs` pins v2's own hashes so the
pipeline cannot drift within v2, which is the drift that would actually orphan users' covers.

**Adoption is enforced by `O_EXCL`, not by convention.** `save_cover` opens with `create_new(true)`,
so an entry inherited from v1 keeps v1's bytes even when v2 processes the identical source. Nothing
rehashes, re-encodes or migrates the copied directory. The accepted cost — one duplicated file per
cover that is re-extracted under v2 — is asserted rather than left to be discovered.

**The art fixture's CI step lives in `lint`, not `rust-checks`,** unlike `verify:db-baseline`. It
executes v1's real `sharp`, which is a `node_modules` dependency, and `rust-checks` deliberately
skips `pnpm install`. A pure-builtin reimplementation would be measuring the reimplementation instead
of measuring v1. The Electron half is captured by hand (`--write --with-electron`) and carried
forward; CI never spawns Electron.

**Pruning takes its reference set through an `ArtReferences` trait.** `metadata` and `db` are both
rank 2, so the dependency is inverted the way `core::paths::PathAuthority` inverts it. v1's fail-safe
is reproduced exactly and is the most load-bearing line in the module: a failed reference lookup
prunes _nothing_, because "the database is unavailable" and "nothing is referenced" are
indistinguishable from there and one of them means deleting the user's entire cover cache.

**Four deviations from v1 in the tag writer**, all recorded in the crate docs:

1. **Every write is atomic.** v1 wrote mp3 (node-id3) and flac (flac-tagger) by reading the whole
   file into memory and overwriting the original path in place — no temp, no backup, synchronously on
   the main thread. Only the ffmpeg branch used temp-and-rename. v2 routes every format through that
   shape. `lofty` covering all formats is what makes one safety story possible.
2. **`.wav` is writable.** v1 hit `default:` and logged, while the IPC handler still returned
   `success: true` and committed the database row — so the file and the library diverged permanently.
3. **Foreign tags survive.** v1's FLAC path rebuilt the comment block from the eight fields it knew,
   erasing `REPLAYGAIN_*`, `MUSICBRAINZ_*`, `COMPOSER` and every custom key.
4. **Failures are reported.** The crate returns `Result`; v1 swallowed every per-format failure.
   **Phase 14 owns preserving the wire contract** — `metadata:write-tags` must keep answering
   `{ success: true }` for "the request was processed", because the renderer commits the database row
   on it. That is a command-layer concern, not a crate one.

Field mappings are asserted three ways per format (mapping direction, the identifier's presence in
the written bytes, and the round-tripped value) rather than round-tripped through `ItemKey`, which
would pass even if lofty and v1 disagreed about which frame a field lives in. ID3v2 maps `TRCK` to
both `TrackNumber` and `TrackTotal`, so the reverse lookup is ambiguous for exactly the fields most
worth checking. `lofty` upgrades v2.3's `TYER` to `TDRC` on read and splits it back on write, so both
directions match v1's node-id3 output.

**`picture[0]` is kept, deliberately.** v1 takes the first embedded picture with no front-cover
preference, so a file whose first `APIC` is a back cover yields that. Preferring
`PictureType::CoverFront` would change which image a user sees; that is a product decision, not a
port decision, and is left for one.

**Two lookup deviations.** Transport failures propagate instead of collapsing into "no result" —
v1's `catch → return null` made a 429 indistinguishable from a genuine miss, and the renderer then
added the track to a _persisted_ skip list, permanently marking a rate-limited track unmatchable. And
the release year is read from the ISO string rather than through `new Date().getFullYear()`, which
reported the previous year for January-1 releases west of UTC.

**The yt-dlp cover fallback is a `LookupFallback` trait**, not a call: `downloader` is rank 3 and
`metadata` is rank 2. iTunes-only is a complete configuration and is what Phase 9 scopes; the
composition root supplies the impl if the fallback is wanted. `EnrichContext::itunes_endpoint` exists
so a batch can be driven against a loopback server rather than the real API.

**Appendix B additions.** `regex 1.11` (the nine ported cleaning rules include one long alternation
over YouTube-title noise; hand-rolling it would be a rewrite of the thing being ported), `futures`
(bounded concurrency), `tokio-util` (the `CancellationToken` §2.2 row 16 already names), and
`image`/`fast_image_resize` per D16. `unicode-perl` is enabled so `\s` matches what JavaScript's
does; `\d` and `\b` are pinned back to ASCII at their use sites, since JavaScript's are ASCII-only.
`serde_json` is dropped from `music-metadata`'s role entirely — `lofty` replaces music-metadata,
node-id3, flac-tagger **and** the ffmpeg re-mux path, as §2.2 row 17 predicted.

## Phase 10 implementation amendments (2026-08-01, `v2-library`)

Recorded from the shipped `shiranami-library` lane; full rationale lives in the crate's module
docs.

**The scan pipeline has no database, and must not acquire one.** This supersedes the Phase 10 row's
implication that rows are written here, and the "cancel mid-scan leaves no partial rows" criterion
is met structurally rather than transactionally. v1's main process is a **stateless scanner**: it
has no diffing logic, no database access during a scan, and no knowledge of the `folders` table. It
discovers files, reads tags, and returns the whole result across IPC. Every reconciliation decision
lives in the renderer — `apps/web/src/lib/scanHelpers.ts` and `useLibraryRescan.ts` — as three
round-trips: `library:scan-folder-grouped`, then `db:tracks:exists-many`, then `db:tracks:add-many`.
`apps/web` is unchanged in v2 (§2.6), so it still does. A scan that also wrote rows would not merely
duplicate work: `db:tracks:add-many` is `ON CONFLICT DO NOTHING` and returns only the rows that
landed, so the renderer would receive an empty array, report "library up to date" for a folder full
of new music, and never enqueue what it had just imported. `shiranami-db` is therefore **not** a
dependency of this crate (only a dev-dependency, for the reconciliation test), and the
single-connection pool is trivially safe from here because it is never reached. Phase 7 remains a
correct _ordering_ dependency for the phase; it is not a code one.

**There is no new/changed/moved detection to port.** File identity is the absolute path string —
no mtime, no size, no content hash, and the only `mtime` use in v1 is the unrelated waveform cache.
Consequently: a file whose tags are edited on disk is invisible to every future rescan, because an
existing path is filtered out _before_ it is read; and a moved or renamed file is an insert at the
new path plus a hard delete at the old, which resets `play_count`, `is_favorite` and
`loudness_lufs`, mints a new `id`, resets `created_at`, and cascades away every playlist entry and
history row keyed on the old id. There is no `UPDATE tracks SET file_path` anywhere in v1. All four
matrix cases are pinned against a real fixture database in `tests/reconciliation.rs`, which ports
the renderer's own diff so the behaviour is executable in one place — including the assertion that
seven plays are lost across a move. Identity-preserving move detection is a real feature needing a
stable key the schema does not store; it is the highest-value thing this subsystem lacks and is
left for a product decision, not smuggled in as a port.

**`notify` is not used and is not pinned.** v1 has no folder watcher of any kind — no `chokidar`,
no `fs.watch`, no polling timer, no rescan on startup or focus — and `folders.last_scanned` is
written but never read. Every scan is user-triggered from one of three buttons. The §2.1 charter
lists scan/validate/storage and no watch; adding one would be a new feature wearing a port's
clothes.

**Concurrency is 16, and deliberately not v1's real 64.** v1's grouped scan — the only path
production uses — nested two pools: root files at `PARSE_CONCURRENCY` 16, then four subfolders
concurrently at 16 each, so the true peak was 64 in-flight parses. That is an artifact of the
pool-of-IPC-round-trips shape, not a tuning decision, and reproducing it would mean 64 threads
decoding JPEGs at once. v2 flattens the grouped scan into one ordered pass over every discovered
file at 16, in a **scan-owned** `rayon::ThreadPool` rather than the global one (a scan runs for
minutes and must not monopolise it). Output order and the end-to-end progress contract are
identical, because v1 already called `setBatchSize(totalFiles)` once for the whole scan rather than
per group.

**Pipeline shape.** `discover` (walkdir, single-threaded) → `parse` (rayon ×16: tag read, cover
decode/resize/encode, art-cache write) → ordered `collect` that short-circuits on the first
cancellation. Parallel workers feed no shared writer, because there is none: the only mutation a
worker makes is a create-exclusive append to the content-addressed art cache, whose `EEXIST` is the
dedupe happy path — asserted under real parallelism by a 40-file same-cover test that ends with one
cache entry. The single shared state is an atomic progress counter. Cancellation is checked once
per file at task entry, exactly where v1 checks it, so a file that emitted a tick has a complete
entry behind it; rayon's `Result` collect reproduces v1's `hasFailed` latch.

**Deliberate v1 behaviours reproduced rather than fixed**, each pinned by a test so the choice is
visible: no hidden-file, dot-directory or `node_modules` exclusions (v1 has none, so `.Trashes/` is
walked); macOS AppleDouble `._track.mp3` sidecars are discovered, fail to parse, and become
placeholder rows; the extension test uses `lastIndexOf('.')` semantics, so a file named exactly
`.mp3` matches where `Path::extension` would skip it; symlinked files _and_ directories are skipped
entirely, which also removes any need for cycle detection; and the grouped scan reaches one
directory level deeper than a flat one because v1 re-enters each subfolder with a fresh depth
counter. `validate-files` keeps `Path::exists` rather than `try_exists`, because v1's bare `catch`
made `EACCES`/`EIO`/a disconnected mount indistinguishable from `ENOENT` — and all of them lead to
deletion. Softening that belongs in `apps/web`, which owns the decision to delete.

**Three recorded deviations.** (1) `ScanProgress.ok` is always `true`: its `false` case meant "the
`utilityProcess` rejected", which has no in-process analogue, and repurposing the field to mean
"a placeholder was substituted" would change the value the renderer receives for every corrupt
file. (2) `VALIDATE_CONCURRENCY` 128 survives as the batch granularity, not as a concurrency
ceiling — "128 in flight" in a threaded runtime means 128 OS threads, which is worse than the
descriptor pressure the number was chosen to bound; storage's `STAT_CONCURRENCY` is dropped
entirely for the same reason, with no observable change since the result is a sum. (3) Disk-usage
folder paths deduplicate as paths rather than as raw strings, so a library registering both
`/music` and `/music/` no longer double-counts its bytes into one bar. That one is a fix, taken
because the behaviour it replaces has no defensible reading.

**Appendix B additions.** `fs4 0.13` for the `statvfs` figures: v1 reads three distinct fields
(`blocks`, `bfree`, `bavail`) and deliberately computes free space from `bavail` but used space
from `bfree`, and `unsafe_code = "deny"` rules out calling `statvfs`/`GetDiskFreeSpaceExW`
directly. `sysinfo` — already pinned for Phase 16 — supplies only two of the three, so `usedBytes`
would have silently changed basis. `sysinfo` itself is pinned here for the RSS-delta telemetry the
done-criteria name; v1's second telemetry record (`phase: 'utility-exit'`) is dropped, since its
only subject was proving that killing the child returned its RSS. The Windows drive-root parsing is
hand-rolled rather than delegated to `std::path`, for the reason v1 calls `path.win32.parse`
explicitly: so the bucketing rule stays testable on a POSIX host. `new Date().toISOString()` is
hand-rolled too (`iso8601.rs`, Hinnant's `civil_from_days`, checked against V8 output) because no
date crate is pinned — **move it to `shiranami-core` when a second consumer appears**, the same
note Phase 4 left on `instant.rs` for the parse direction.

**One pre-existing bug fixed in passing.** `shiranami-metadata`'s library used `tokio::select!`
without its crate enabling tokio's `macros` feature; it compiled only through unification with its
own dev-dependency, so `cargo check -p shiranami-metadata` failed on its own and no crate
depending on metadata could be built in isolation.

## Phase 11 implementation amendments (2026-08-01, `v2-downloader`)

**Structure.** `spawn` (argv + the `ProcessRunner` seam + classifier + version compare) · `bin` (layout, fetch, archive, install, the two managers, combined status) · `download` (one run: output parsing + the runner) · `queue` (pure state machine + async driver + persistence + throttle) · `extract` (detect, youtube, spotify + its fallbacks, matcher, service). `src/bin/` is a library module, so the package sets `autobins = false` rather than letting cargo infer binary targets from it.

**The queue is split into a pure state machine and a driver.** v1 interleaved transitions with their consequences inside each method, so every test of a transition first needed a fake persistence, a fake broadcaster and a controllable runner. `queue::state` is synchronous, returns `Effect`s, and touches no I/O; `queue::manager` performs them. This is also what satisfies `await_holding_lock` by construction — the `std::sync::Mutex` is taken, effects are collected, the lock drops, then anything awaits.

**Two v1 bugs fixed in port.** A download directory that failed to resolve threw synchronously out of `start()` and left the item wedged in `active` holding a concurrency slot nothing would ever free; it now settles as `error`. And `canceled` vs `error` was decided by asking the `AbortController` whether it had fired, with the rejected error's name as a "secondary guard" — two sources of truth, now one typed `DownloadFailure` variant.

**One v1 bug preserved deliberately**, pinned by a test: a yt-dlp JSON entry with no `id` yields `https://www.youtube.com/watch?v=undefined`, because v1 interpolated `data.id` before applying its own default. The renderer has received that string for every id-less entry since the feature shipped.

**`zip` replaces four extraction paths** (§2.2 #19 anticipated one). v1 had a Windows worker thread trying adm-zip → `tar` → PowerShell, plus a macOS `unzip` child. All four are gone, which also removes three processes that may be missing from a Finder-launched PATH (R19) and adds zip-slip refusal via `enclosed_name`, which the PowerShell and `tar` paths could not do at all.

**Bounded output capture, asymmetrically.** v1 accumulated both child streams without limit. stdout keeps its _head_ (64 MiB) because `--dump-json` and `--get-url` read from the front; stderr keeps its _tail_ (1 MiB) because the classifier reads from the back. Truncation is recorded rather than hidden.

**Child-process hardening beyond v1:** `kill_on_drop(true)` plus an explicit kill-and-reap on cancel or timeout (R20); `stdin` is `/dev/null`, closing nightcore's implicit stdin-EOF gap; both pipes drain concurrently, since draining stdout first deadlocks a child that fills the stderr buffer. `--version` deliberately carries **no** `--ignore-config`, matching v1's `execFile` argv exactly.

**Platform is a value, not a `cfg`.** `bin::layout::Platform` is threaded as a parameter, so the Windows asset URL and file names are asserted on a macOS runner. v1 could only test this by reassigning `process.platform`, and two of its tests left the property non-configurable for whatever ran next. v1's dev-mode walk-up from `app.getAppPath()` to the workspace root is dropped — it derives a runtime path from the build tree, which §2.3 forbids; the bin directory is a parameter.

**Progress events are de-duplicated, not throttled, on the install path.** v1 fired the callback per chunk (~19,000 calls to deliver 101 values for a 150 MB archive). Only changes are reported: same values, same order. The queue's own 250 ms trailing throttle and its immediate flush-and-cancel on structural change are unchanged (R24). v1's exact ffmpeg progress sequence (`23, 45, 46, 50, 73, 95, 96, 98, 100`) is pinned by test.

**Quarantine stripping no longer shares one try/catch** across ffmpeg and ffprobe, where a failure on the first left the second unrunnable.

**Wire types added to `shiranami-core::models`:** `ToolStatus`, `DownloadLocation`, `CachedToolStatus`, `DependencyCheck`, `DownloadProgress`, `DependencyInstallProgress`. They lived in `contracts/src/ipc/preload-api.ts`, which Phase 2 did not port — the same gap and the same resolution as Phase 7's history types. The `downloader.*` error codes were never in a registry at all (v1 built them at the `new IpcError(...)` site), so they are declared in `downloader::error::code` with a mirror test that re-reads v1's source.

**SSRF guard placement mirrors v1 exactly.** Untrusted URLs are checked with `is_http_url` at the extraction boundary and again in `append_url_arg`, which also inserts `--`. The DNS-resolving guard stays where v1 had it (radio proxy, cover art) and is _not_ applied to binary downloads — those URLs are compile-time constants, and resolving them a second time would refuse a corporate mirror behind the system proxy that `shiranami-net` exists to keep working.

**Appendix B additions:** `zip` (new), and direct pins for `regex`, `unicode-normalization` and `async-trait`, all three already resolved transitively. `tokio` gains `process` workspace-wide and `macros` for this crate only. `reqwest` is a direct dependency for header _vocabulary_ only — this crate constructs no client.

**Real-yt-dlp tests are gated on the binary's presence** so CI stays hermetic, and carry a `SHIRANAMI_YTDLP_PATH` override so the skip is provably a skip: pointing it at `/bin/echo` fails two of the three (R17's lesson, applied to a skipping test).

**Fixtures.** `spotify-embed-playlist.html` is copied into `crates/shiranami-downloader/fixtures/` so the suite survives Phase 20 deleting `apps/desktop`, with a test asserting byte-identity while both exist — the treatment `shiranami-db` gave `v1-schema.json`. Both paths are prettier-ignored.

## Phase 12A implementation amendments (2026-08-01, merged to v2)

- Lyrics precedence found and ported: `lyrics.preferSyncedFromLrclib` only ever promotes LRCLIB past _untimed_ local sources; synced local/embedded always short-circuits before the network. Sidecar probing order: `.lrc` beside track / `Lyrics/` / `lyrics/`, then the same for `.txt`; a timestamp-less `.lrc` is held back as last resort, not returned early.
- A failed lyrics lookup is `LyricsError::Lookup` and is NOT cached (Phase 9's 429-vs-miss rule applied); a 404 remains a cacheable miss. LRCLIB is reached directly through net's gated client (the `lrclib-api` package's wire shape reproduced exactly) so `Retry-After` is honored.
- Weather reading cache bounded (50 tiles); share codes validated against the nanoid alphabet before path interpolation; share base URL keys on `debug_assertions`, not an env var.
- Preserved v1 asymmetries deliberately: create-response passthrough (additive server fields can't break the client), unconditional `searchResults[0]`, case-sensitive unanchored deep-link scheme match.
- Residual gap: ID3v2 `SYLT` is parsed for MPEG/AIFF/WAV with ms timestamps only (v1's music-metadata reported ms only); LRC-inside-`USLT` fully covered.

### Phase 14 prep (accumulated from lanes 11–12A)

- `WEATHER_UNAVAILABLE` should move into `core::error::codes` (currently declared in `weather/error.rs` with a note — lane A had no core-edit rights).
- `recommendation::core::instant` (ISO-8601) now has its second consumer (lyrics/share validation shapes; likely scrobble too) — move it to `shiranami-core` per Phase 4's amendment.
- **No `youtube_mappings` repository exists in `shiranami-db`** — Phase 7 didn't cover the table; share-payload assembly (which joins tracks/playlists with YouTube ids) lives in the Phase 14 command layer as it did in v1 and needs that repository created.
- v1 performs no checksum/signature verification on downloaded yt-dlp/ffmpeg binaries (Phase 11 finding, ported as-is: atomic rename + chmod + xattr only). Adding real verification is new behavior — a post-cutover hardening decision, deliberately not smuggled into the port.

## Phase 12 lane B implementation amendments (2026-08-01, `v2-integrations-b`)

Recorded from the shipped scrobbling and Discord Rich Presence modules; full rationale lives in the
modules' docs. Lane A (lyrics, weather, share) is separate.

**The deferred connect-result types are resolved, and the deferral's premise is confirmed.** Phase 2
left `LastfmConnectResult` / `ListenBrainzConnectResult` unported because they are
`{ ok: true; … } | { ok: false; error }` unions discriminated on a **boolean literal**. `specta`
2.0.0-rc.25 genuinely cannot express one: `datatype::Literal` exists in its source, but the
re-export is commented out (`// pub use literal::Literal;` in `specta/src/datatype.rs`) under a
module header saying it "isn't being shipped for now". The resolution is three-part, and it lives in
`shiranami-core` rather than `shiranami-integrations` because the export harness CI diffs is in
core — the deferral was about _representation_, not location:

- **Rust side, a real enum.** `ScrobbleConnectResult` cannot hold a username and an error at once.
- **Wire side, hand-written `serde`.** The bytes are v1's exactly: the arm that does not apply is
  **absent**, not present and null. A derived flat struct would have emitted `"error":null` on
  success, and byte-compatibility was the constraint.
- **TypeScript side, a flat mirror** the `Type` impl delegates to, whose `username?` / `error?`
  describe those two byte layouts honestly. It is a widening of v1's union and it is what the
  renderer's existing call sites compile against — they read `.ok`, then `.username ?? ''`, and
  never read `.error` at all.

v1's two result types are structurally identical and neither is imported by `apps/web`, so they
collapse into one. `beginLastfmAuth`'s result was _already_ a flat
`{ ok: boolean; token?: string; error?: string }` in v1, so it joins them as `LastfmAuthStart` and
all three results in the flow now share one shape.

**Discord's contracts are mirrored into core, and the templates become a struct.** `packages/shared`
stays TypeScript (§1.3), so the client id, image key, landing URL, field cap and default templates
are a mirror with an equality test, never a redefinition — the client id names a registered Discord
application and the image key names an art asset uploaded to it, so drift renders a blank card with
nothing in any log. `DiscordPresenceTemplates` is a three-field struct rather than the
`Record<ActivityType, Template>` TypeScript declares: identical JSON, but "all three activity types
have a template" now holds by construction. The partial forms v1 accepted on the way in get explicit
patch types, so its object-spread merges are typed operations.

### Migration `0002_scrobble_queue.sql` — v2's first post-baseline migration

Purely additive: one table and one index, nothing altered. That is what keeps it
`backwardCompatible` in the sense §3.2 freezes for the handover window — the `user_version` floor
stays at **8**, and a rolled-back v1 build opens the file and never queries the extra table. The
drizzle rollback ledger keeps exactly its nine names; a v2-only table must not leak into a chain v1
would try to replay.

Adoption stamps **only** the baseline, so `0002` runs for real on both a fresh install and a database
adopted from v1. Both directions are asserted
(`the_post_baseline_migration_runs_on_{a_fresh,an_adopted_v1}_database`), and the shared adoption
invariant now derives its expected ledger from `MIGRATOR` rather than hard-coding a version list —
the property under test is "the baseline is stamped and everything after it is run", not "there are
two migrations". A later migration stamped instead of applied would otherwise never reach an adopted
database, and would surface as a missing table months later.

Two pre-existing tests had to be corrected rather than merely updated, and both were latent traps:

- `schema_equivalence.rs`'s `baseline_database()` ran the whole migrator despite being documented as
  "a database with nothing but `0001_baseline.sql` in it". It now applies that file directly. The
  three comparisons there ask whether the squash reproduces **v1's** schema; v2's own tables would
  only make them fail for the one reason that is not a bug.
- The adoption row-count assertions compared the whole before/after list. A new _empty_ table is
  exactly what an additive migration looks like, so they now compare per table and additionally
  require any new table to arrive empty — a stronger statement than the equality it replaces.

Table-shape notes: `started_at` is unix **seconds** (it is the timestamp submitted to both APIs);
`next_attempt_at` and `enqueued_at` are unix **milliseconds** (they are compared against the local
clock, as v1 compared them against `Date.now()`). The remaining targets are two CHECK-constrained
flags rather than a list column or a child table — `ScrobbleTarget` is a closed two-variant set, and
flags make v1's `remainingTargets.length === 0 → drop` rule something the database enforces.
`enqueued_at` exists only to order eviction, standing in for the array position v1 spliced.

`QueuedScrobble` lives in `shiranami-db` beside its table, **not** in `core::models`, whose stated
contract is that everything in it crosses the IPC boundary. This one never does — the renderer sees
only `pendingCount`.

**A latent v1 bug closes in the port.** v1's `enqueue` appended unconditionally, so re-parking a play
the queue already held — same artist, track and start second, hence the same content-derived id —
put two copies in the array and submitted it **twice** on the next flush. `id` is the primary key
here, so a re-enqueue updates in place.

**Discard rules are v1's, verbatim, including what v1 did not do.** A submission failure is a
submission failure: v1 never classified them, so a 400 from Last.fm retries exactly like a timeout,
and genuinely permanent errors are dropped by the attempt ceiling like everything else. The ceiling
is 10 attempts and the cap 500 rows. (v1's comment claimed the backoff curve spans "~17h"; it
actually spans about five. The constant is ported, not the arithmetic in the comment.)

### Deviations from v1, and why each is forced

**Scrobbling.** The now-playing ping runs _concurrently with_ the submission rather than detached —
v1 fired it without awaiting and swallowed its rejection; a spawned task here would need a runtime
handle this crate has no business holding and could outlive shutdown, while `join` reproduces the
observable behaviour exactly. Opening the browser for Last.fm's auth page is the composition root's
job (`tauri-plugin-opener`), so the URL is returned rather than opened. The flush timer belongs to
the composition root too. Credentials are read with `option_env!`, never `std::env::var`: v1's were
inlined by esbuild at build time _precisely because_ a packaged main process cannot see those
variables at runtime, and a runtime read here would compile fine and leave every shipped build
permanently unconfigured.

**The single connection is never held across a request.** The pool holds one connection (Phase 6), so
the scrobbler submits first and acquires afterwards — `submit_play` takes one short write, `flush`
one read of the due rows and one write pass over the results. A ten-second HTTP timeout with the
connection in hand would stall every query in the app. This is `repo/mod.rs`'s rule for commands,
applied to a background task: acquire late, release early, never await the network holding one.

**Discord.** `discord-rich-presence` (Appendix B) has **no event surface**, where v1's
`@xhayper/discord-rpc` emitted `disconnected`; a dropped socket is therefore discovered when the next
write fails. For a presence card that is the same thing to a user, since there is nothing to show
between updates. v1's two `setTimeout`s become one `pump` the composition root drives. The socket
sits behind a `PresenceSocket` trait, and every call runs in `spawn_blocking` — its transport is a
blocking Unix socket or named pipe. `pump` takes its clock as an argument for the same reason
`build_presence` does: crossing the fifteen-second rate-limit window is worth testing and is not
worth fifteen seconds of test runtime.

Field truncation counts **characters** where v1 counted UTF-16 code units. `slice(0, 127)` on a
string whose 127th unit is the first half of a surrogate pair yields an unpaired surrogate, so v1
could hand Discord an ill-formed field for a title containing an emoji; the two agree for every field
inside the limit. The presence timestamp is **milliseconds**, verified on both sides: v1 handed its
client a `Date`, which the client serialized with `getTime()`, and the pinned crate's `Timestamps`
documents the same unit.

Two v1 details preserved that read like bugs and are not: the first reconnect waits **five** seconds,
not ten, because v1 scheduled with the current delay and doubled afterwards (the state machine now
returns the delay so it cannot be read at the wrong moment); and a settings save re-renders the card
_through_ the throttle, so it cannot bypass the rate limit.

**Appendix B additions.** `md-5 = "0.10"` — the crate §2.2 row 25 names, and not a choice: Last.fm
defines `api_sig` as md5 of the signature base string. Pinned to the 0.10 RustCrypto line so it
shares one `digest` version with `sha2`. Used strictly as a request signature Last.fm dictates, never
for anything security-bearing. `discord-rich-presence = "1.1"` as pinned. `sqlx` and `reqwest` are
added to `shiranami-integrations` — the former because the retry queue is a table, the latter for
header names and values only, exactly as `shiranami-serve` takes it; `shiranami-net` remains the sole
constructor of a reqwest `Client`.

**Signing is pinned by exact-output vectors, not by shape.** Last.fm answers an invalid signature
with one generic message and no indication of which part was wrong, so a test asserting "32 hex
characters" would have passed through every mistake worth catching. The vectors assert the signature
base _and_ the digest for a realistic scrobble, including a non-ASCII title — `update(base, 'utf8')`
means the bytes hashed are UTF-8, which is the detail that would break signing for a Japanese library
and nowhere else.

## Phase 14 kickoff implementation amendments (2026-08-01, merged to `v2`)

Recorded from the command/event skeleton and its three reference namespaces
(`store`, `db:tracks`, `weather`); full rationale lives in the modules' docs.

### The prep items from "Phase 14 prep" are all closed

- `WEATHER_UNAVAILABLE` moved into `core::error::codes`. It needed a second
  mirror-assertion shape: it is a standalone `export const` beside the weather
  domain types rather than a key inside `error-codes.ts`. `weather::error`
  re-exports it, pinned by a pointer-identity test so it cannot quietly become a
  local copy again.
- `recommendation::core::instant` moved to **`core::time::instant`** with its
  twelve V8-cross-checked tests. `recommendation::core::instant` survives as a
  re-export: `affinity` documents its options by pointing at that path, and the
  scoring core's surface is a port contract that should not shift because a
  helper changed rank. `core::time` is a folder so `shiranami-library`'s
  `iso8601` formatter — which carries the same "move on a second consumer" note
  for the _format_ direction — has an obvious place to land.
- `discord::service`'s re-export of `scrobble::now_ms` became
  `integrations::clock`, which **re-exports core's** `now_ms` rather than
  redefining it. Both `scrobble::now_ms` and `discord::now_ms` stay as
  re-exports, so no caller moved.
- **`repo::youtube_mappings` created** (four functions for v1's four query sites;
  its two identical `onConflictDoUpdate` blocks collapse into one `upsert`).
  Three findings worth carrying:
  - v1 never joins this table. Ordering and drop-on-miss both live in the
    JavaScript loop that consumes a `Map`, and both are observable — a shared
    playlist keeps its `position` order, a track with no mapping is silently
    omitted rather than erroring the payload, and RD-mix seeds are fetched
    strongest-first so the best seed wins the dedupe. A SQL join would move all
    three into the query. The repository returns the mapping and nothing else.
  - `searched_at` holds **two formats**: the column default on insert, v1's
    `toISOString()` on conflict. Both are on disk in every shipped library, so
    the split is reproduced rather than tidied (the `folders.last_scanned`
    situation again).
  - v1's chunking asymmetry is **not** reproduced — the share path chunked at
    500 and the recommendation seed path did not, and the only input on which
    they differ is one large enough to raise `SQLITE_MAX_VARIABLE_NUMBER`.
    Reproducing a failure mode is not port fidelity.

### There is no `settings:*` namespace

The Phase 14 brief named `settings` as a reference namespace; v1 has none. App
settings are one opaque key inside the store blob, and the renderer reaches
every preference through the generic three-channel `store` namespace. That is
what was ported, and it is the better reference anyway: the renderer-writable
key allowlist stops being a validation step and becomes a **type**, so
`scrobble.settings` is not rejected inside a command — it is unrepresentable as
an argument to one.

### One generated file, emitted from the composition root

§2.5 said the bindings land in `packages/contracts/src/generated/`; it did not
say how many files. Two is worse than one and the reason is not obvious:
`specta-typescript` emits a definition for **every type a signature
references**, so a `commands.ts` beside `core.ts` would carry a second copy of
`Track`, `Playlist` and forty others — two declarations of one contract in one
directory, which is the drift the whole apparatus exists to prevent.

So `core.ts` is retired and `bindings.ts` replaces it, emitted by
`shiranami_desktop_lib::bindings`, which feeds `shiranami_core::bindings::types()`
to its `tauri-specta` builder. Core keeps the vocabulary and its _content_
tests (casing, the string unions the renderer switches over, the store-key
allowlist); the **file guards moved with the writing**, and
`scripts/verify-drift-guard.mjs` now perturbs a core type and requires the
_desktop_ export to change — a strictly stronger proof than before, because it
also shows the vocabulary genuinely flows through the command export rather
than merely being written beside it.

`Builder::types(&core_types)` registers the vocabulary **whole** rather than
letting command signatures pull types in one at a time. Otherwise a model no
landed command mentions yet would vanish from the emitted file and reappear
when its lane merged, producing diff churn with nothing to do with drift.

### `ErrorHandlingMode::Throw`, not the default

tauri-specta defaults to `Result`, which makes every generated call resolve to a
`{ status, data } | { status, error }` union. §2.6 has the shim reconstruct an
`IpcError`-shaped `Error` **from a rejection**, so a rejection is what the
generated callable has to produce — otherwise the shim unwraps a union and
re-throws at all 135 call sites. This is the one builder setting a careless
refactor would silently revert, so a test asserts the emitted file contains no
result union.

The `__IPC_ERROR__` sentinel is deleted server-side per D9 and is asserted
absent twice: once on the serialized payload, once on the generated surface
(with comments stripped — `ErrorPayload`'s doc _explains_ the sentinel, and that
explanation is worth keeping).

### The registry is a token-tree muncher, and that is a merge decision

`collect_commands!` needs literal paths at expansion time — `tauri::generate_handler!`
and `specta::function::collect_functions!` both do — so `Commands` values cannot
be merged and a runtime list is impossible. The obvious shape is one central
file listing all 135 command paths, which is one file every one of the
twenty-four lanes edits, in the middle, with semantically adjacent lines.

Instead, a namespace declares its commands in its own file behind a `commands!`
macro, and contributes **one line** — its name — to `registry::namespace_list!`.
A continuation-passing muncher walks the list and lets each namespace append its
own paths.

That list is read **twice**, by two callbacks, which is what keeps a lane to one
line rather than two: `declare_modules!` turns it into the `pub mod` items in
`commands/mod.rs`, and `begin_gather!` seeds the muncher. Otherwise a lane could
add its module in one place, forget the other, and get a namespace that compiles
and registers nothing.

Two macro details are load-bearing and neither is discoverable from the error
messages:

- The accumulator is `$($t:tt)*`, **not** `$($p:path),*`. A fragment matched as
  `path` becomes one opaque AST node, and `collect_commands!` matches on
  `$b:ident $(:: $p:ident)*`, which an opaque node cannot satisfy.
- Paths are spelled `crate::commands::…`, not `$crate::…`. `$crate` expands to a
  resolver-level token that `collect_commands!`'s `$b:ident` cannot match.

### Never name `serde_json::Value` in a command or event signature

specta's `Value` impl is marked _inline_ and `Value` is recursive, so the
exporter **overflows its stack** rather than emitting anything — the failure
arrives as `fatal runtime error: stack overflow` from a test that looks like it
only writes a file, naming nothing. specta's `serde_json` feature is therefore
deliberately **off** in the workspace manifest, which turns the same mistake
into a compile error naming the line. `wire::Json` (a transparent newtype whose
specta type is `Unknown`) is the supported way to carry an opaque value, and it
is what `store:get`/`store:set` use — v1's tuple was
`[rendererStoreKey, z.unknown()]`, because the renderer owns the shape of its
own persisted zustand slices.

### The twenty events are typed, and their names are attributes

v1 leaves the invoke/event split implicit — `ALL_IPC_CHANNELS` is one flat list,
and whether an entry is an event is discoverable only from a `createIpcListener`
in the preload or a `webContents.send` in main. `events.rs` makes it explicit,
which is the largest readability gain the port gets for free.

Every event carries `#[tauri_specta(event_name = "…")]`. **Without it the derive
kebab-cases the struct name**, so `LibraryScanProgress` would register as
`library-scan-progress` and the renderer's listener on `library:scan-progress`
would simply never fire — a failure with no error anywhere. All twenty names are
pinned against `packages/contracts/src/ipc/channels.ts`.

Each event is a `#[serde(transparent)]` newtype over exactly **one** payload,
because v1's `createIpcListener<T>` strips the Electron event object and hands
its callback one argument. Eight payloads whose models belong to unlanded lanes
are `wire::Json` for now; replacing one with a real type is a binding-visible,
reviewable change.

### Managed state is a record, not a boot sequence

`AppState::from_parts` takes already-built pieces. There is no constructor that
opens a database or starts a server, because §2.8's ordering is Phase 16's and a
constructor here would be a second, competing definition of it. `lib.rs` wires
the invoke handler and mounts the events but does **not** `manage` the state, so
every stateful command is registered and typed but answers "state not managed"
until Phase 16 boots — the honest intermediate, with a real surface for the shim
and the lanes to build against and nothing pretending to have booted.

**`AppState::conn` is the crate's only acquire site**, mirroring
`repo::conn::acquire` one rank down. The pool holds a single connection, so a
second acquire while the first is held does not fail — it hangs. The `db:tracks`
suite asserts this rather than describing it: fifteen acquisitions back to back
under a ten-second timeout, so a leaked connection is a named failure instead of
a hung suite.

### Two seams, because their concrete type is a boot decision

`MediaControlsService<B>` is generic over a backend that is Windows/macOS-only,
needs a live window handle on Windows and a running run loop on macOS, and
carries thread-affinity constraints that decide what lock wraps it.
`DiscordPresence<S, N>` is generic over a socket and a notice sink, and
`SHIRANAMI_E2E=1` runs with neither. Both become `Arc<dyn Trait>` in
`crate::seam` per §2.3, with method sets taken **verbatim from the four v1
channels that name them** (`media:playback-state`, `media:clear-state`,
`discord-rpc:update-presence`, `discord-rpc:clear-presence`), so a lane
implementing one is porting rather than designing. `media:command` is
deliberately absent — it travels the other way and is an event.

Recording doubles for both seams ship in `seam::fake`, so every lane tests
against the same double rather than inventing one.

### R15 and R16 are retired by source-grep guards, added before the fan-out

`arch_guards.rs` (nightcore's file, scoped to the composition root) pins the two
rules no type can express, and it exists **now** rather than after twenty-one
lanes have written commands against the skeleton — a rule that arrives late
arrives as a twenty-one-file cleanup.

- **R15**: every command is `async`, with an empty `SYNC_COMMAND_ALLOWLIST`
  ratchet. "It does not need to be async" is not grounds for an entry; "it must
  not be" would be, and nothing has claimed that.
- **R16**: no bare `tokio::spawn`. R16 was nominally retired in Phase 2 but no
  guard was ever built, and the command layer is the first place `spawn` appears.

Three things the guards taught on their first run, all recorded in the module:

- The scan must **strip comments**, because this crate documents the very rules
  it bans; a scan that flagged the documentation explaining a ban is the fastest
  way to get a guard deleted.
- The guard file must exclude **itself**, because it is the only source naming
  those patterns in string literals. Both guards reported themselves first.
- The command attribute is assembled with `concat!` rather than written, because
  `lint:meta`'s own `rust-command-placement` rule is also a text scan and flagged
  the file whose job is to search for it. That keeps the shared rule absolute
  instead of growing an exemption list.

Both guards are proven non-vacuous the way the drift guard is: making
`health_check` synchronous fails the first, and a bare `tokio::spawn` in its body
fails the second, and restoring the file makes both pass again.

### Appendix B addition

`tauri-specta = "=2.0.0-rc.25"` with `derive` and `typescript`; `javascript` is
off, since a second emitter is a second thing the drift guard has to diff.
`async-trait` is added to `shiranami-desktop` for the two seams, the same reason
`shiranami-downloader` takes it for its `ProcessRunner`.

## Phase 14 lane 5 implementation amendments (2026-08-01, `v2-cmd-integrations`)

The four integrations namespaces — `scrobble` (7 channels), `share` (4),
`discord-rpc` (4), `lyrics` (1). Sixteen invoke commands; the lane's one event,
`share:deep-link`, was already declared by the kickoff and needed no change.

### Share-payload assembly, and what the repository deliberately does not do

The 12A amendment's rule is implemented literally: `repo::youtube_mappings`
answers "which of these tracks have a mapping" and nothing else, and both
observable behaviours live in `commands/share/assembly.rs`'s loop — a shared
playlist keeps its `position` order, and a track with no mapping is silently
omitted rather than erroring the payload. Both are pinned, and the ordering one
is asserted twice: once on the assembled payload, and once on the **bytes the
server receives**, because a loop that reordered would still look right in a
`HashMap`-keyed assertion.

Two details that read as redundancy and are not, both preserved:

- The per-track resolver re-reads the cache even though the bulk prefetch ran
  before the loop. That re-read is the only reason a playlist holding the same
  track **twice** searches once — the prefetch has no entry for the second
  occurrence, and only the re-read sees the row the first one just wrote.
- The artist falls back to `UNKNOWN_ARTIST` in the payload and to `''` in the
  search query. v1 spelled the two differently and the difference is
  observable: searching YouTube for "Song Unknown Artist" finds different
  videos from searching for "Song".

`playlist_tracks::get_tracks` supplies the ordering by `INNER JOIN … ORDER BY
position`, which is where v1's two-step read plus JavaScript reorder ends up;
the ordering that had to stay in this layer is the **mapping** loop's, not the
track fetch's.

### The commands are split so the orchestration is testable

Each of the three network-facing share channels is a three-line
`#[tauri::command]` over an inner function taking `&ShareClient`. Without the
split, everything past the argument check is unreachable from a test — the
client's base URL is fixed at build time on purpose, so there is no seam to
point at a loopback server, and building a `State<'_, AppState>` needs a webview.
This is `weather::validate_query`'s precedent applied to a whole body rather
than to a guard.

`SearchService` needed no seam at all: its dependency on the outside world is
`spawn::ProcessRunner`, which is already a public trait, so the whole share path
runs against a scripted yt-dlp with no binary installed.

### `seam::Presence` gains `update_settings`, and its sibling read does not

The kickoff placed both Discord settings channels outside the trait, on the
reasoning that both only touch the store. That holds for the read and not for
the write: v1's `updateDiscordRpcSettings` persists and then connects,
disconnects, or re-renders the card, and `DiscordPresence::update_settings`
reproduces all three. Routing the write through the store alone would leave a
**stale presence card up** after a user switches Rich Presence off — the socket
would stay open until Discord noticed it close on its own. That is a visible
regression rather than a deferred effect, so the write is a seam method.

`get-settings` stays outside the trait, because settings exist on a run that has
no Discord and the Settings pane has to render them there too. The write falls
back to a plain store update when the seam is absent, which is the same set of
observable effects: nothing to tear down, nothing to re-render.

### `Deferred` gains `lyrics` and `search`

Neither can be built from `AppState::from_parts`'s finished pieces.
`LyricsService::new` takes an `Arc<dyn LyricsPolicy>` whose containment answer
comes from the watched-folder set, and `SearchService::new` needs the resolved
path to a yt-dlp binary that may not be on disk on a first run. Both are
constructed **once** for the same reason the weather service is: an LRU and an
in-flight coalescing map are the lyrics service's entire memory.

`error::not_booted` is the shared answer for an absent piece: `INTERNAL`, naming
the piece. Not a new registry code — v1 had no equivalent state, and minting one
would hand the renderer a string it has no translation for. It is deliberately
**not** a fabricated success: a `scrobble:get-status` that invented
`{ enabled: false }` would tell a connected user they are disconnected.

### Two crate additions, both because a consumer finally exists

- `repo::tracks::get` backs no `db:tracks:*` channel and never will — the
  renderer holds the library in memory and never asks for one row. v1's
  `ipc/share.ts` read one inline, and the alternative here was scanning
  `get_all` for it.
- `impl WireError for ScrobbleError`. Every variant is `INTERNAL`, and that is
  the policy rather than laziness: the failures a _user_ causes never reach the
  boundary as errors at all — they are absorbed into the `{ ok: false, error }`
  value the connect channels return. What is left is a queue read that failed,
  for which v1 threw a bare `Error`.

### `share:import` returns `unknown`, and that is D25 holding

The share DTOs deliberately do not derive `specta::Type`: they are an HTTP
contract with `apps/server`, and generating renderer types from them would make
a server-side DTO change regenerate the renderer's types. So all three
network-facing share channels return `wire::Json`. Only the _type source_
changes — the response is still validated here before it is handed on, which is
the part that was protecting the renderer from hostile input.

### The one functional gap: the Last.fm auth page is not opened

v1 called `shell.openExternal` inside `beginLastfmAuth`; Phase 12 moved that out
of the crate and named `tauri-plugin-opener` as the composition root's
mechanism. That plugin is not a dependency yet, and adding one means pinning it
in Appendix B **and** registering it in the boot sequence — an Appendix B
decision and a §2.8 decision, neither of which is a namespace lane's to make,
and both of which `shell:open-external` needs identically. So the two land
together rather than one lane pinning a dependency on the other's behalf.

Until then `scrobble::open_auth_page` logs the URL at `warn` and says why. The
wire contract is unaffected — `{ ok, token? }` is what the renderer reads and it
is already byte-exact — but the handshake cannot complete until the plugin is
registered, so this is a launch blocker rather than a cosmetic gap.

## Phase 14 lane 6 implementation amendments (2026-08-01, `v2-cmd-window`)

The `window` (6), `app` (3), `dialog` (2), `shell` (2) and `debug` (2)
namespaces — 15 invoke channels — plus `window:maximized-change` and
`debug:metrics`. Full rationale lives in the modules' docs.

### Phase 16 inherits four items from this lane

1. **`persist_compact_bounds` on the window's `close` handler.** v1 registered
   `mainWindow.on('close', persistCompactBounds)` because quitting from compact
   mode — taskbar, Alt+F4, a system shortcut — bypasses the explicit exit path
   and loses the corner the user parked the mini-player in. The function is
   `pub` in `commands::window` and has no caller yet.
2. **`window:set-compact-mode` needs `AppState`** for that same corner
   (`MainStoreKey::CompactWindowBounds`), so it answers "state not managed"
   until Phase 16 boots. The other five window commands work today.
3. **The log directory is `<app data>/logs`, via `crate::paths::logs_dir`**, not
   Tauri's `app_log_dir()` — which on macOS is `~/Library/Logs/<bundle id>`, a
   directory §3's first-run continuity does not copy because it copies the v1
   _data_ tree. Phase 16's logger must resolve it through that function, or
   `app:open-logs-folder` opens an empty folder.
4. **`FoldersCache` is built per check, not held.** `crate::paths::ensure_allowed`
   is correct but not the cache the audio route needs; see below.

### The path guard is a rank-1 module, not a `shell` detail

`crate::paths::ensure_allowed` is v1's `isPathAllowed` with its warning line,
its `FORBIDDEN` code and its ordering, placed where the stream server and the
storage namespace reach the same rule rather than restating it — a second copy
of a security boundary is a second thing that can drift out of agreement with
the first. A source-scan test pins that the guard precedes the OS call in both
`shell` commands, because a refactor that hoisted `spawn_blocking` above it
would still compile and still reject, after having already revealed or deleted.

`PathAuthority` is deliberately synchronous so `FoldersCache::is_path_allowed`
stays a plain function the audio route can call under `spawn_blocking`, but two
of its three answers come from SQLite. The async half therefore runs **first**
and hands the cache a snapshot of resolved facts. That inverts the laziness —
the tracks lookup happens even when containment would have answered alone —
which costs one indexed `SELECT` on a right-click. The alternative is `block_on`
inside a `PathAuthority`, on a thread that may be the runtime's own, which is a
deadlock rather than a cost. Phase 16 owns the long-lived cache with a real
authority behind it.

### Two managed holders are installed in `run()`, not deferred

`compact::CompactModeState` and `commands::debug::DebugSampler` replace two
things v1 kept as module-level mutable state, which §2.3 forbids. Unlike
`AppState` they open nothing and order against nothing — both are `Default` and
purely in-memory — so `manage`-ing them beside the plugins costs no ordering
guarantee and lets both namespaces answer for real from Phase 14 rather than
Phase 16.

### Neither new plugin is granted a capability

`tauri-plugin-dialog` and `tauri-plugin-opener` are registered after
single-instance (§2.8 step 4) and `capabilities/default.json` is **unchanged**.
Every call is Rust-side, where the plugins bypass their own ACL, so a JS
permission would add nothing this lane needs and would hand the webview an
unguarded `open_path` and `reveal_item_in_dir` — making the guard above
decorative. `open_js_links_on_click` is off for the same reason: it is the
opener plugin's one webview-reachable behaviour.

### Compact mode is a state machine, and that is what made it testable

v1 kept `isCompactMode`, `normalBounds` and `wasMaximizedBeforeCompact` in a
closure over the `BrowserWindow`. `crate::compact` holds them as values with
`plan()` and `valid_compact_position()` over them, and `commands/window.rs` is
left with field copies and `match` arms over a `tauri::Window` no test can
construct — `shiranami-media-controls`' backend split, one rank up.

Two Tauri gaps, neither of which costs anything:

- **No `getNormalBounds`.** Electron reports a maximized window's _restored_
  rectangle; Tauri reports what is on screen. v1 only used `normalBounds` on the
  path where the window was **not** maximized, since a maximized one is restored
  by re-maximizing, so `WindowFacts::bounds` is `None` for a maximized window
  rather than a lie.
- **No maximize/unmaximize event.** `Resized` fires for both and for every frame
  of an edge drag, so `window:maximized-change` is derived with one
  compare-and-swap. Without it the renderer would receive an event per frame.

Work areas are converted with **each monitor's own** scale factor rather than
the window's; Tauri reports them in physical pixels and v1 stored the corner in
logical ones, so using the window's factor misplaces the mini-player on a
mixed-DPI desktop.

Five of the six window commands log and return rather than rejecting: Electron's
`minimize`/`maximize`/`close`/`setAlwaysOnTop` return `void` and do not throw, so
those channels never rejected and the renderer's titlebar handlers have no
`catch`. Propagating Tauri's `Result` would turn "the compositor declined a
minimize" into an unhandled rejection inside a click handler.

### `debug:metrics` — R13's second accepted loss, now concrete

§2.2 #31 said "shape changes"; this is the shape. v1 sampled `getAppMetrics()`
(per-process breakdown by Electron process _type_), `process.getCPUUsage()` and
`process.getHeapStatistics()`. There is no V8 in the backend to report a heap
for and no Chromium registry to label a process `Browser` or `GPU`, so v2
reports this process and its **direct** children with CPU percentage and RSS.
Field names (`pid`, `cpu`, `mem`) and `mem`'s unit (kibibytes) are v1's, so the
panel's formatting survives; `type` becomes `kind: "main" | "child"` rather than
inventing Electron's vocabulary for processes that are not Electron's. The event
payload stops being `wire::Json` and becomes the real type.

One level of children, not a transitive walk: the webview host and the helpers
Tauri spawns are direct children on all three platforms, and a full ancestry
walk would sweep in whatever a user's `yt-dlp` went on to start. v1's four
safety rules survive, and "numbers and process kinds only" is now a test over
the serialized payload — the tempting field to add is the process _name_, which
`sysinfo` hands over for free and which would leak what the user is running.

### Two v1 behaviours deliberately not reproduced

- **`app:get-locale-country` reports the UI locale's region.**
  `app.getLocaleCountryCode()` returned the OS _region_ (macOS
  `NSLocale.countryCode`), which a user sets independently of the UI language.
  No crate reads the region separately on all three platforms. The one consumer
  is radio's "Near you" shortcut, whose failure mode is stations from the wrong
  country rather than an error. The contract — alpha-2 or `""` — is unchanged.
- **`app:open-logs-folder` reports a failed open.** Electron's `shell.openPath`
  _resolves_ with an error string rather than throwing and v1 ignored it, which
  was an artifact of the API rather than a decision — the same handler's
  `mkdirSync` could already throw, so the channel was already rejection-capable.

And one that looks like an omission and is not: **there is no
`shell:open-external` in v1** to port. It has exactly two `shell:*` channels;
everything that opens a URL goes through `share:*` or the updater, and §12's
`integrations::share` returns the URL rather than opening it. So
`shiranami_net::is_http_url` has no call site in this lane — both arguments here
are filesystem paths, and a URL guard applied to a path refuses every one.

### Appendix B addition

`tauri-plugin-dialog = "2.7"`, `tauri-plugin-opener = "2.5"`, `trash = "5"`,
`sys-locale = "0.3"`. `sysinfo` and `tokio` are added to `shiranami-desktop`
from the existing workspace rows — `tauri::async_runtime` re-exports the
runtime's `spawn` and its channels but not its timers, and a `std::thread::sleep`
in the sampling task would park a runtime worker a second at a time.

## Phase 14 fan-out ledger (2026-08-01, all seven lanes merged to v2)

Surface complete: **136 commands** (135 v1 channels + `health_check`) and all **20 events**, registry-counted and drift-guarded. Per-lane deviations live in the lanes' module docs; cross-cutting outcomes:

- `commands/mod.rs` now spells out the module list literally — the macro-generated tree hid every command file from rustfmt (24 files of invisible formatting debt confirmed and cleared when the list was made literal).
- Lane 2 built the missing `recommendation::service` + `repo::recommendations` (§2.2 #24 mapped it; Phase 4 shipped only `core`). Golden-vector replays pin the service half.
- `AppState.pool` sits behind a lock so `db:backup:import` can swap the live database; `pool()` returns an owned handle, `conn()` never holds the guard across an await.
- `media:playback-state` drives Discord presence directly (v1's own wiring — the discord namespace's `update-presence` is settings-dialog-only). `Presence::update_settings` is a seam method because the settings write tears the socket down.
- Downloader/`playlist` command modules are `pub` (the `#[tauri::command]` hidden macro doesn't travel through `pub use`).

### Phase 15 obligations (the shim)

- Handle `play`/`pause` on `media:command` — new in v2 (webview MediaSession is suppressed; v1's renderer switch has no default branch).
- `db:backup:{export,import}` now take a path argument; the file dialog moves to the shim. **Tension to resolve:** lane 6 deliberately granted the webview NO dialog capabilities (Rust-side calls bypass the plugin ACL) — the shim needs a save/open dialog via the existing dialog commands or one new narrowly-scoped command, not a broad capability grant.
- `share:import` returns `unknown` on the wire (D25 keeps share DTOs zod-only); the shim types it from `packages/contracts`' zod schemas.
- Error rehydration per D9: the wire carries no `__IPC_ERROR__` sentinel; the shim reconstructs whatever renderer-visible error shape v1's preload produced.

### Phase 16 obligations (boot), accumulated

- `manage` the three cancel-slot states (`ScanSlot`, `EnrichRuns`, `LoudnessRuns`) or cancel channels fail at runtime.
- Construct every `Deferred` service: serve handle, downloads driver (+ `hydrateAndResume`), lyrics (needs the folders-cache policy), search, scrobbler, discord presence, media controls, updater.
- Updater impl over the seam (`tauri-plugin-updater`) and **extend `is_release_pending`** beyond `latest.yml` or every release window shows an error toast.
- Register `tauri-plugin-opener` and wire the Last.fm auth-page open (lane 5's flagged launch blocker); registration order keeps single-instance first.
- Boot actions from v1: `fetchAndCacheToolStatus`, the yt-dlp discover recompute + 30-second coalesced refresh (seed selection is already ported).
- Folders-cache invalidation on `db:folders` add/remove and downloader set-location; own the long-lived `FoldersCache`.
- `persist_compact_bounds` on window close; log dir is `<app data>/logs`, not `app_log_dir()`.
- Fix `shiranami_db::open`'s non-`Send` future at source (deref-coercion reborrow; lane 2 worked around it with `block_on` in backup-import).
- Move `off_thread`/`data_dir`/`require_path` from `commands/library.rs` into `crate::wire`.
