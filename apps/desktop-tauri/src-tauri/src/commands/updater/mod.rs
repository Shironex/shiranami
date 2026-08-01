//! `updater:*` — the auto-update surface, over a seam the plugin fills later.
//!
//! Three invoke channels and **six** events, ported from
//! `apps/desktop/src/main/ipc/updater.ts` and `app/updater.ts`. The largest
//! event-to-command ratio in the whole surface, and the reason is that the
//! renderer's update UI is driven almost entirely by the event stream: the three
//! commands are "start something", and everything the user sees comes back on a
//! channel.
//!
//! # Why this namespace has no domain crate
//!
//! Every other namespace delegates into a `shiranami-*` crate. This one cannot
//! yet: the real implementation is `tauri-plugin-updater` (§2.2 subsystem 6), and
//! wiring it is Phase 16's — it needs the app handle, the boot sequence's hourly
//! tick, and the minisign keypair that Phase 19 provisions. §4 also makes the
//! *handover* from `electron-updater` the project's #1 risk, which is a
//! separate piece of work again.
//!
//! What can land now, and what the renderer needs in order to be left unchanged
//! (§2.6), is the **shape**: three commands with v1's argument and return types,
//! six events with v1's channel names and byte-identical payloads, and one
//! trait — [`crate::seam::Updater`] — between them and whatever performs the
//! update. Phase 16 writes one implementation of that trait and the update UI
//! starts working with no renderer diff and no change to these files.
//!
//! So the wire vocabulary lives in [`contract`] rather than in
//! `shiranami-core::models`, beside the namespace that owns it, until there is a
//! crate for it to move to.
//!
//! # The three modules, and why the split
//!
//! | Module       | Job                                                       |
//! | ------------ | --------------------------------------------------------- |
//! | [`contract`] | the four types that cross the boundary                    |
//! | [`events`]   | the six transitions, and the one mapping to channel+bytes |
//! | [`invoke`]   | the three commands, and what they do with nothing wired   |
//!
//! The invoke surface and the event surface really are two jobs here, in a way
//! they are not for any other namespace: everywhere else an event is a
//! side-effect of a command, and here the six events are the primary contract
//! while the three commands only start things.
//!
//! # v1's three commands, and the one that cannot fail
//!
//! | Channel                     | v1 resolves            | Can reject |
//! | --------------------------- | ---------------------- | ---------- |
//! | `updater:check-for-updates` | `{ enabled: boolean }` | **no**     |
//! | `updater:start-download`    | `void`                 | yes        |
//! | `updater:install-now`       | `void`                 | yes        |
//!
//! All three took **no arguments** (`z.tuple([])` three times), and none was
//! registered with `handleWithFallback`.
//!
//! `checkForUpdates` not being able to fail is deliberate in v1 and is ported as
//! such: its body wraps the actual check in a `try`/`catch` that logs and falls
//! through to `return { enabled: true }`. A failed *check* therefore reaches the
//! user as an `updater:error` **event**, never as a rejected invoke — which
//! matters, because the renderer's `useUpdater` maps a rejection and an error
//! event to different states. [`crate::seam::Updater::check`] is infallible for
//! that reason.
//!
//! `enabled: false` is v1's "there is no updater here": `app/updater.ts` disables
//! itself in dev and on macOS (the app is unsigned — §4.3 records that v2 keeps
//! it that way until the Developer ID cert lands). An absent seam answers the
//! same way, which is also what `SHIRANAMI_E2E=1` should look like.
//!
//! # The six events are the contract, and three of them carry payloads
//!
//! | Channel                        | Payload                    |
//! | ------------------------------ | -------------------------- |
//! | `updater:checking-for-update`  | none                       |
//! | `updater:update-available`     | [`UpdateInfo`]             |
//! | `updater:update-not-available` | none                       |
//! | `updater:download-progress`    | [`UpdateDownloadProgress`] |
//! | `updater:update-downloaded`    | [`UpdateInfo`]             |
//! | `updater:error`                | a bare `string`            |
//!
//! Two details of that table are load-bearing and both look like oversights:
//!
//! - **`update-not-available` drops its payload.** v1's handler receives the
//!   `UpdateInfo` and logs the version, then calls `sendToRenderer(channel)` with
//!   no second argument. The renderer's listener is `(callback: () => void)`.
//!   Adding the payload would be a wire change for a callback that takes no
//!   arguments.
//! - **`update-available` and `update-downloaded` carry `releaseNotes` and
//!   `releaseDate` that no renderer code reads.** A grep of `apps/web/src` finds
//!   only `.version` on both. They are ported anyway: they are on the wire today,
//!   the update UI is the surface most likely to grow a "what's new" panel, and
//!   dropping a field is not a decision this phase gets to make on the renderer's
//!   behalf.
//!
//! # `RELEASE_PENDING` is a sentinel value on the error channel
//!
//! v1 classified one updater failure specially: a missing release manifest means
//! the release is published but its artifacts are still building, which is not
//! something to show a user. It sends the literal string `RELEASE_PENDING`
//! instead of the message, and `useUpdater` matches that literal and returns to
//! `idle` with no error and no toast.
//!
//! [`is_release_pending`] is v1's predicate verbatim, and [`RELEASE_PENDING`] is
//! v1's literal. **The predicate is written against `electron-updater`'s
//! wording** — `latest.yml` is electron-builder metadata that v2 does not
//! publish — so Phase 16 has to extend it with whatever `tauri-plugin-updater`
//! says when its manifest 404s. That is one function and it is named here so the
//! extension has an obvious home; guessing at the plugin's wording now would be
//! inventing a failure mode rather than porting one. The renderer-visible half —
//! the literal on the wire — is frozen either way.

pub mod contract;
pub mod events;
pub mod invoke;

pub use contract::{UpdateDownloadProgress, UpdateInfo, UpdaterCheck, UpdaterFailure};
pub use events::{
    AppUpdaterEvents, RELEASE_PENDING, UpdaterEvent, UpdaterEventSink, is_release_pending,
};

pub(crate) use invoke::commands;
