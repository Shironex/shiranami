//! `downloader:*` — twenty-three channels, ported from
//! `apps/desktop/src/main/ipc/downloader.ts`.
//!
//! The largest namespace in the surface after `db:tracks`, and the one with the
//! most going on behind it: two managed binaries, a search path, a queue with
//! its own driver, and five of the six events this lane owns. Every one of them
//! delegates into `shiranami-downloader`; what lives here is argument
//! validation, the fallback channels, and the translation from a crate sink to
//! a `tauri-specta` event.
//!
//! # A folder, not a file
//!
//! `lint:meta`'s `rust-module-shape` caps a module at 400 code lines, and
//! twenty-three commands with their tests are well past it. The split is by
//! what the commands *talk to*, which is also how they group in v1's file:
//!
//! | Module        | Channels | Talks to                                    |
//! | ------------- | -------- | ------------------------------------------- |
//! | [`location`]  | 2        | the settings store and `location`           |
//! | [`tools`]     | 9        | `bin::Tools`, the two binary managers       |
//! | [`fetch`]     | 4        | `SearchService`, `DownloadRunner`           |
//! | [`queue`]     | 8        | `queue::DownloadQueue`                      |
//!
//! # Four of these are fallback channels, and one of the four changed shape
//!
//! v1 registered exactly nine channels with `handleWithFallback`; four are
//! here — `check`, `check-ffmpeg`, `refresh-tool-status` and `suggest`. A
//! fallback swallows the handler's failure and answers with a degraded value,
//! and validation failures deliberately bypass it (a tampered argument must not
//! masquerade as a degraded upstream).
//!
//! Three of the four are now **unreachable by construction**, which is a
//! fidelity improvement rather than a gap:
//!
//! - `bin::Tools::ytdlp_status` and `ffmpeg_status` cannot fail. Where v1's
//!   `getYtDlpStatus()` threw if the upstream version probe rejected, the port
//!   returns `latest_version: None`. The observable answer is the same
//!   `{ installed }`-shaped degradation v1's fallback produced, arrived at
//!   without a thrown-and-caught round trip.
//! - `SearchService::suggest` returns an empty `Vec` on any failure, which is
//!   exactly what v1's `() => []` fallback returned.
//!
//! `refresh-tool-status` keeps a real fallback, because resolving the download
//! location creates a directory and that can genuinely fail. See [`tools`].
//!
//! # The startup background refresh is not here
//!
//! v1 ended `registerDownloaderHandlers()` with a fire-and-forget
//! `fetchAndCacheToolStatus()`, so the settings panel had a warm cache before
//! the user opened it. That is a boot action, not a command, and §2.8's
//! ordering is Phase 16's — the same reason `hydrateAndResume()`, which v1 also
//! called from inside handler registration, is not called here either.

// The four command modules are `pub`, not private with re-exports, and that is
// forced rather than chosen: `#[tauri::command]` emits a hidden `__cmd__<name>`
// macro **beside the function**, and `collect_commands!` resolves the path it is
// given down to that macro. A `pub use` carries the function and not the macro,
// so a re-exported path fails to resolve with an error naming a symbol nobody
// wrote. [`list`] therefore spells the defining module in every path.
pub mod fetch;
pub mod location;
pub mod queue;
pub mod tools;

mod deferred;
mod list;

// `playlist:*` reaches the same service bundle — extraction is a downloader
// capability that v1 happened to register under a second channel prefix — so
// the accessor is shared rather than written twice.
pub(crate) use deferred::services;
pub(crate) use list::commands;
