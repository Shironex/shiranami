# Shiranami v2 — music companion / desk pet: technical feasibility & architecture

Research date: 2026-08-05. Read-only pass over `crates/`, `apps/desktop-tauri/src-tauri/src/`,
`apps/web/src/{lib/bridge,stores,hooks}`, `docs/v2/architecture.md`, the feature-wave research
docs, plus Tauri v2 web research (docs, `tauri-apps/tauri` issues/discussions) on second-window
cost and transparent/click-through window support.

Scope of this doc: **feasibility and architecture only** — the product/personality lens is
`docs/v2/feature-wave/research-delight.md` (F1 "Nami's notes", ranked #1 there and backlogged to
v2.1 alongside "desk companion" in `docs/v2/feature-wave/plan.md` §Rules). This doc decides _where
the pet runs_, _what it eats_, and _what it costs_.

---

## 0. Grounding: what already exists

- **The mascot is real and already in-tree.** `apps/web/public/mascot.png`, rendered today only in
  `apps/web/src/components/shared/ViewEmptyState/ViewEmptyState.tsx`, with one flourish
  (`MascotIdleNote/` — a drifting `Music2` glyph, cadence-randomized, `useReducedMotion`-gated).
  The companion is not a new character; it is a promotion.
- **The RAM story is the headline.** `docs/v2/architecture.md` §1.2 sets the footprint goals;
  user-measured reality on Windows is **12–20 MB RSS vs 200–300 MB for v1**, ~16.8 MiB DMG. §1.2
  also pins "OS process count at idle ≤ 3". A feature that adds a webview process or a standing
  CPU load regresses the one number v2 is being sold on.
- **Playback is renderer-owned and stays that way.** §2.2 #40: "Renderer audio engine — unchanged,
  do not port." Every real-time signal the pet wants already lives in the React process.
- **Motion discipline exists.** `apps/web/src/hooks/useDecorativeMotion.ts` is the single gate
  (`!prefers-reduced-motion && !lowPerformanceMode`); research-delight declares it non-negotiable
  for every new flourish. The pet routes through it.

---

## 1. What the pet can already feed on (no new backend required)

Enumerated against `apps/web/src/lib/bridge/namespaces/`, `packages/contracts/src/ipc/channels.ts`
and `apps/desktop-tauri/src-tauri/src/events.rs` (20 v1 events + `analysis:progress`,
`doctor:progress`).

| Signal                                                                       | Source                                                                                                                                                                 | Pet use                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Play/pause, current track, playhead, volume                                  | `apps/web/src/stores/usePlaybackStore.ts` — renderer-local, **zero IPC**                                                                                               | instant reactions: bob while playing, sleep on pause, wake on track change                                   |
| Finished plays (`played_seconds`, `completion_ratio`, `completed`, `source`) | `db:history:record-play` — `apps/desktop-tauri/src-tauri/src/commands/db_history.rs:160`                                                                               | the durable XP accrual point (§5)                                                                            |
| Per-day plays + minutes, hourly heatmap, totals, weekly insights             | `db:history:get-activity` / `get-hourly-activity` / `get-summary` / `get-weekly-insights` (renderer queries already exist: `apps/web/src/hooks/queries/useHistory.ts`) | streaks, "big listening day" moods, weekly-recap reactions — **no new tally table needed**                   |
| Track BPM + musical key                                                      | `tracks.bpm` / `tracks.musical_key` — migration `crates/shiranami-db/migrations/0003_track_bpm_key.sql`, filled by the F2 analysis engine                              | animation tempo: CSS `animation-duration: calc(60s / var(--track-bpm))` — the pet literally bobs on the beat |
| OS remote presses                                                            | `media:command` event (`events.rs:134`)                                                                                                                                | react to skips/pauses arriving from SMTC/headphone buttons                                                   |
| Long-running work                                                            | `analysis:progress`, `library:scan-progress`, `downloader:queue-state` / `downloader:progress` events                                                                  | "working" poses: headphones on during analysis, digging during downloads                                     |
| Weather + local hour                                                         | `weather:get-current` + `useWeatherStore` (already combined this way in research-delight F1)                                                                           | context moods; rainy-day umbrella                                                                            |
| Loudness profile                                                             | `loudness_lufs` (`0005_loudness_profile.sql`)                                                                                                                          | optional: scale animation energy to how loud the track actually is                                           |

The striking property: **for architecture (a) the six most valuable signals cost zero new IPC.**
The pet component sits in the same React tree as `usePlaybackStore` and TanStack Query's history
caches. Only companion _state_ (level, name, stage) needs new channels.

---

## 2. Architecture (a) — in-app companion layer

A React layer inside the existing window: the mascot gets a permanent perch (Overview corner,
player bar, and/or the compact mini-player), an animation state machine, and a level/evolution
model persisted behind two or three new `companion:*` commands.

**Cost:** zero new windows, zero new webviews, zero new processes. RAM delta is sprite-sheet
assets plus one component subtree — well under 1 MB, invisible against the 12–20 MB baseline.
Idle CPU is a pure function of animation discipline (§6) and can be held at literal 0%.

**Contract mechanics** (the part with sharp edges): new invoke channels go into the manifest tree
in `packages/contracts/src/ipc/channels.ts` **and** into `V2_ONLY_CHANNELS` (channels.ts:326); a
new event must be added to the `events!` block _and_ `V2_EVENT_CHANNELS`
(`apps/desktop-tauri/src-tauri/src/events.rs:223`) or the era-parity tests fail the build. Same
pattern `analysis:*` and `doctor:*` used; the v1 Electron preload treats v2-only members as
optional and the renderer feature-detects.

**Reach beyond the main window, without a new webview:** the pet can also perch in the existing
compact mini-player (same webview, `window:set-compact-mode`), and the tray icon
(`src-tauri/tray.rs`) can reflect pet mood cheaply. That captures most of the "companion on my
desk while the app is minimized" value at zero marginal cost.

---

## 3. Architecture (b) — OS-level desktop pet window

A separate frameless, transparent, always-on-top window that walks the desktop shimeji-style.
Tauri v2 mechanics, verified against docs/issues:

- **Window flags:** `WebviewWindowBuilder` supports `transparent(true)`, `decorations(false)`,
  `always_on_top(true)`, `skip_taskbar(true)`, `shadow(false)`; click-through via
  `window.set_ignore_cursor_events(true)` — implemented on all three desktop OSes in tao
  (Windows `WS_EX_TRANSPARENT`, macOS `setIgnoresMouseEvents`, GTK empty input region; only
  mobile returns `NotSupported`). **Whole-window only — there is no per-region hit-testing.**
  The accepted pattern for an interactive pet is a Rust-side cursor-poll loop (~60 Hz) toggling
  the flag — which is itself a standing CPU cost in direct tension with our idle-0% budget. A
  Shiranami pet window would stay permanently click-through (presence over interaction, per
  research-delight) or poll only during explicit "petting" windows.
- **macOS caveat:** `WindowBuilder::transparent` is literally feature-gated — docs.rs marks it
  _"available on crate feature `macos-private-api` or non-macOS"_. That flag disqualifies the Mac
  App Store (tauri-docs #463); notarized direct distribution is fine. A pet window also needs
  `ActivationPolicy::Accessory` to stay out of the Dock/Cmd-Tab, `shadow(false)` against border
  artifacts (#14394), and `backdrop-filter` is broken over transparency.
- **Windows caveat:** WebView2 transparency works in current wry/Tauri v2, with open sharp edges:
  white flash on show (#8308, #14515), child-window transparency (#12450), wry #1540/#1524.
  `shadow(false)` is required or Win11 adds a 1 px white border + rounded corners.
- **Multi-monitor / "walking on the taskbar":** already-solved in this repo — the mini-player's
  placement code converts each monitor's `work_area()` with its own scale factor
  (`apps/desktop-tauri/src-tauri/src/commands/window.rs:393-410`, plus visibility math in
  `compact.rs`). Pet ground level = work-area bottom edge, which is exactly the taskbar/Dock top;
  `available_monitors()` / `monitor_from_point()` give the walkable range. Caveat: z-order
  _above_ the taskbar itself is flaky (#11176, #7328, #5638) and Tauri has no app-wide z-order
  (discussion #9685) — the pet walks _on_ the work-area edge, not over the taskbar.

**The disqualifying cost: RAM.** Nobody publishes a Tauri-specific "delta per second window"
benchmark, but the process model is determinable from wry's source plus vendor docs, and real
overlay apps have published baselines (appendix):

| OS                 | Incremental cost of a 2nd webview window            | Mechanism                                                                                                                                                    |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows (WebView2) | **+15–40 MB** (one extra Chromium renderer process) | wry passes the same `data_directory` per webview → per Microsoft's process model, one shared browser + GPU process tree; each window adds a renderer process |
| macOS (WKWebView)  | **+10–25 MB** (one extra `WebContent` process)      | wry shares `WKWebsiteDataStore::defaultDataStore` (shared networking process), fresh `WKWebViewConfiguration` per webview                                    |
| Linux (WebKitGTK)  | **+~120 MB** per extra `WebKitWebProcess`           | measured PSS from a shipped Tauri pet app (cursor-pets: ~274 MB total for one overlay) — though Linux packaging is a §1.2 non-goal for v2.0                  |

Reference baseline for the _whole category_: a minimal transparent always-on-top Tauri v2 overlay
measures **14 MB on Windows 11** — i.e. a pet _window alone_ costs roughly what all of Shiranami
costs today. The same overlay measures 20–29 MB on macOS Sequoia but **66 MB on Sonoma and
110 MB on Tahoe** (an OS-level WebKit regression, identical code) — macOS RSS is already
volatile across OS versions without us adding webviews to the pile.

So a second webview window turns the Windows story from **12–20 MB into ~30–55 MB app-wide** —
it doesn't merely dent the headline number, it deletes it. It also adds a process (breaks §1.2's
≤ 3 pin), and — because an always-on-top window is never occluded — the webview can never
suspend compositing, so the pet costs GPU/CPU _forever_, in direct tension with "calm app people
leave running". **Architecture (b) as a webview is rejected on the numbers.**

**The viable form of (b): a native window, no webview.** Tauri v2's `unstable` feature exposes raw
`tauri::window::WindowBuilder` — a tao window with **no webview attached**, implementing
`HasWindowHandle`/`HasDisplayHandle` since 2.0.0-beta.13. The workspace pin is
`tauri = { version = "2.11", features = ["tray-icon", "image-png"] }` (`Cargo.toml:45`), so this
means adding a feature flag, not a version bump. Rendering, corrected by research:

- **`softbuffer` is disqualified** — its pixel format has no alpha channel (the top 8 bits must
  be zero; winit #2960), so it cannot composite a transparent sprite over the desktop.
- **`wgpu` works** but a device costs ~20–60 MB of RSS, which defeats the purpose (tauri #9220's
  transparency flicker was same-window surface contention; a separate window sidesteps it).
- **The cheapest real path is per-OS layered blitting on the raw handle**:
  `UpdateLayeredWindow` on Windows, `NSWindow` + `CALayer` contents on macOS. Cost ≈ the
  framebuffer itself (a 200×200 RGBA sprite is 160 KB); total incremental RSS ~1–3 MB, zero extra
  processes. A second `winit` event loop is impossible on macOS (main-thread-only), so everything
  hangs off Tauri's own tao loop — which the raw-window route naturally does.

Animation is a Rust-side frame timer that runs only while the pet is animating. This is
shimeji-native territory (sprite sheets, gravity, edge detection against `work_area`) and real but
non-trivial effort: per-OS transparency quirks move from wry's problem to ours, input is manual,
and the sprite pipeline in Rust is new. Estimated effort: a full lane (1–2 weeks focused), gated
behind a 1–2 day spike proving transparent layered blit + click-through on both OSes. **This is
the only (b) that survives the RAM constraint.**

Prior art: Tauri-based pets exist — WindowPet (45+ pets, click-through, above-taskbar),
pet-mochi, cursor-pets, and a CrabNebula tutorial — all webview-rendered, and **none publish
Windows/macOS RAM numbers**; the one published measurement (cursor-pets, Linux) is ~274 MB PSS,
which is the cautionary tale, not the template.

---

## 4. Data model — migration `0006_companion.sql`

Conventions inherited: additive-only (§3.2's `backwardCompatible` sense — a v1 rollback opens a DB
with one extra table drizzle never touches), single-connection pool, every repo fn takes
`&mut SqliteConnection` and never acquires (`crates/shiranami-db/src/repo/mod.rs:11-26`).

```sql
-- 0006_companion.sql — the companion's persistent self. Additive; v1-rollback safe.
CREATE TABLE IF NOT EXISTS `companion_state` (
    `id`           INTEGER PRIMARY KEY CHECK (`id` = 1),   -- singleton row
    `name`         TEXT,                                    -- user-chosen; NULL until named
    `stage`        INTEGER NOT NULL DEFAULT 0,              -- evolution stage reached (monotonic)
    `xp`           REAL    NOT NULL DEFAULT 0,              -- lifetime XP accumulator (seconds-derived)
    `accessories`  TEXT    NOT NULL DEFAULT '[]',           -- JSON array of unlocked accessory ids
    `hatched_at`   TEXT,                                    -- ISO-8601, set on first accrual
    `last_seen_at` TEXT                                     -- ISO-8601, for return-after-absence moods
);
```

Design decisions, each load-bearing:

- **`level` is not a column.** It is a pure function of `xp` (curve lives in code, §4.1). Storing
  both invites drift; `stage` _is_ stored because evolutions are one-way events the user witnessed
  (and may carry a user choice), not recomputable facts.
- **`xp` is an accumulator, not derived from `play_history` on read.** The tempting "no state at
  all — level = f(SUM(played_seconds))" design has a data-loss trap:
  `play_history.track_id` is `ON DELETE CASCADE` (`0001_baseline.sql:103`), so removing tracks
  silently deletes history rows and would _demote the pet_. Instead: **seed** `xp` once from
  `SUM(played_seconds)` at hatch time (existing users' pets hatch at a level that honors their
  history — a genuinely delightful migration), then accrue forward at record-play time.
- **No per-day tally table.** `db:history:get-activity` already returns plays + minutes per
  calendar day with an exclusive `until` bound built precisely for closed-window recaps
  (`commands/db_history.rs:131-150`). Streaks and daily moods are queries, not schema.
- `accessories` as a JSON array follows the `smart_playlists.rules` precedent
  (`0001_baseline.sql`, `rules text DEFAULT '[]'`).

### 4.1 Where the logic lives (crate spine placement)

Spine (`docs/v2/architecture.md` §2.1): `core → net → { db, … }`, everything → src-tauri
(composition root only); 400 code-line file cap; `mod.rs` is a manifest.

| Piece                                                                                             | Home                                                  | Why                                                                                  |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| XP curve, level fn, evolution thresholds, accrual formula (pure math + types)                     | **`shiranami-core::companion`** (new small module)    | core ranks lowest, already holds models/sentinels; pure and unit-testable with no DB |
| `companion_state` reads/writes                                                                    | **`shiranami-db::repo::companion`** (new repo module) | follows the `&mut SqliteConnection` borrow convention; ~100 lines                    |
| Commands (`companion:get-state`, `companion:set-name`, …) + accrual wiring + `companion:xp` event | **`src-tauri/commands/companion.rs`**                 | thin wiring, same shape as every other namespace                                     |

**No new crate.** The feature is ~2 modules + 1 command file; a crate would be ceremony. The
lint-meta layering rules need no change — core and db already sit in the right order.

---

## 5. Event flow — how the pet learns "3 minutes of a 90 BPM track", un-gameably

Two distinct loops, deliberately separated:

**Reactive loop (renderer, real-time, non-durable).** The pet component subscribes to
`usePlaybackStore` (play/pause/track) and reads `currentTrack.bpm` — all in-process. Nothing to
design here; it is props.

**Durable loop (Rust, the XP ledger).** The renderer already runs an honest listening clock:
`apps/web/src/hooks/useAudioEngine.ts` accumulates `session.listenedSeconds` only when
`!audio.paused && !audio.ended && !audio.seeking && readyState >= HAVE_FUTURE_DATA`, with each
tick's delta clamped to 1 s (`MAX_SESSION_DELTA_SECONDS`, line 33) so suspend/resume can't mint
time. `flushPlaybackSession` (line 265) records via `db:history:record-play` only past 30 s
listened or 50% completion, and the Rust side (`repo/history/record.rs`) recomputes
`completion_ratio`/`completed` and writes both statements in one transaction.

**Recommendation: accrue XP inside `db_history_record_play`, Rust-side, after `record_play`
commits** — in the same acquired-connection scope (a local DB write, unlike the scrobble, which
must release first because it awaits HTTP; module docs at `commands/db_history.rs:23-42` explain
that discipline). Then emit a `companion:xp` event (v2-only; both era lists updated) carrying
`{ xpGained, totalXp, level, leveledUp }` so the pet celebrates in real time.

Why this point can't be gamed:

- Leaving the app open silently accrues **nothing** — the session clock only ticks while a deck is
  actually playing with decoded audio ahead of it; pause detection already exists and is the same
  machinery play history and scrobbling trust.
- Radio is excluded from sessions at the source (`resetPlaybackSession` nulls radio tracks,
  useAudioEngine.ts:255-257), and `source` still arrives on the record for policy anyway.
- The renderer _could_ lie over the wire (`playedSeconds` is client-supplied) — accepted: it is
  the exact trust model play counts, history, and scrobbles already live under. A cheater cheats
  their own pet.

One honest caveat to note in implementation: the session clock is driven by the engine's rAF loop,
and hidden windows throttle rAF — long minimized listening under-counts (each resumed tick adds
≤ 1 s). Pre-existing behavior inherited by history/scrobbles alike, not pet-specific; if it ever
matters, move the session tick to the audio element's `timeupdate` (fires while hidden) in a
separate fix.

---

## 6. Performance budget — idling at 0%

Rules that keep the pet free:

1. **CSS-only animation, compositor-only properties** (`transform`/`opacity`, or a `steps()`
   sprite-sheet on `background-position` swapped to `transform` atlas shifts). No pet-owned
   `requestAnimationFrame` loop, ever. The engine's existing rAF loop is playback's, not ours.
2. **Paused music = static frame.** The sleep pose is a frame, not an animation —
   `animation-play-state: paused` (or unmounting the animated class). A static composited layer
   costs literally nothing. This single rule is most of the budget.
3. **Hidden/occluded window costs nothing for free**: rAF stops and WKWebView/WebView2 suspend
   compositing when the window is hidden — CSS animations produce no frames nobody sees. Add a
   `visibilitychange` listener anyway to drop to the static pose (belt and braces, and it gives
   the pet a canonical "you left" state for `last_seen_at`).
4. **Beat-bob is cheap because it is slow**: `animation-duration: calc(60s / var(--bpm))` on a
   transform is one compositor keyframe track at ~1–3 Hz.
5. **Gates:** `useDecorativeMotion` (reduced motion + `lowPerformanceMode`) hides all motion;
   Sanctuary Mode (`useSanctuaryStore.sanctuaryActive`) either hides the pet or shows the static
   sleeping pose — the sanctuary is a screensaver and the pet must not be the brightest thing in
   it. Auto-entered sanctuary implies user absence: a good `last_seen_at` signal.

Anti-goal recorded: architecture (b)'s webview variant fails this section _structurally_ — an
always-on-top window is never occluded, so its compositor never idles regardless of discipline.

---

## 7. Recommendation and phasing

**Recommendation: (a) now, native-(b) later, webview-(b) never.** The in-app companion delivers
the level/evolution/companionship loop at zero RAM/CPU regression and reuses six existing data
sources with no new backend beyond one table and three commands. The OS-level pet is only
acceptable as a native (no-webview) window and is a separate, spike-gated lane once the character
has proven itself in-app.

Lane-sized phases (feature-wave discipline: worktree lanes, conventional commits, all gates green,
era lists updated):

- **Phase 1 — the ledger (Rust lane).** Migration `0006_companion.sql` + hatch-seeding from
  history; `core::companion` (curve + types, pure tests); `db::repo::companion`;
  `commands/companion.rs` (`get-state`, `set-name`, accrual hook in `db_history_record_play`,
  `companion:xp` event); channels.ts + `V2_ONLY_CHANNELS` + `V2_EVENT_CHANNELS` + registry counts.
  Ships dark — no UI.
- **Phase 2 — the resident (web lane).** Pet component + animation state machine (sprite sheet,
  poses: idle/bob/sleep/work), perch in Overview + player bar + compact mini-player, driven by
  `usePlaybackStore` + BPM + the progress events; visibility/sanctuary/decorative-motion gating;
  level-up celebration on `companion:xp`; settings toggle. This phase is where F1 "Nami's notes"
  microcopy can ride along or follow.
- **Phase 3 — growth (delight lane).** Evolution stage art + accessory unlocks keyed to milestones
  the history queries already answer (streaks, hundredth play, weekly insights); naming ceremony;
  return-after-absence moods via `last_seen_at`. EN + PL copy, house voice ("observations, never
  prompts").
- **Phase 4 (optional, later, spike-gated) — the desk pet.** 1–2 day spike: Tauri `unstable` raw
  window + per-OS layered transparent blit (`UpdateLayeredWindow` / `NSWindow`+`CALayer`) +
  `set_ignore_cursor_events` + `work_area` ground plane on Windows/macOS, **RSS measured
  before/after in Task Manager / Activity Monitor** (the web research's own conclusion: nobody
  has published this number — measure, don't trust). Proceed to the walking pet only if the spike
  holds ~≤ 3 MB and idle-0%; otherwise the compact mini-player perch already covers the
  minimized case.

---

## Appendix — web sources consulted

(RAM figures and platform caveats; see §3.)

- **Process model / per-window cost:** wry source — `wry/src/webview2/mod.rs:289`
  (`CreateCoreWebView2EnvironmentWithOptions` per webview, shared `data_directory`) and
  `wry/src/wkwebview/mod.rs:217-246` (fresh `WKWebViewConfiguration`, shared
  `WKWebsiteDataStore::defaultDataStore`); Microsoft WebView2 process-model docs (same user data
  folder → same browser/GPU process collection, +1 renderer per window).
- **Overlay baselines:** Manasight ADR spike (blog.manasight.gg, Mar 2026) — transparent
  always-on-top Tauri v2 overlay: Windows 11 14 MB / <1% CPU; macOS Sequoia 20–29 MB, Sonoma
  66 MB, Tahoe 110 MB (OS-level WebKit regression, identical code). Linux: iiviie/cursor-pets
  published PSS ≈ 274 MB total (main 113 + WebKitWebProcess 121 + NetworkProcess 39); each extra
  WebKitGTK webview ≈ +120 MB.
- **Transparency/click-through:** docs.rs tauri 2.11.5 — `WindowBuilder::transparent` gated on
  `macos-private-api` (MAS-disqualifying, tauri-docs #463); `Monitor::work_area()`,
  `monitor_from_point()`. Issues: #14394 (macOS border), #13415 (DMG transparency loss — did not
  reproduce in the Manasight tests), #8308/#14515 (Windows white flash), #12450 (child windows),
  wry #1540/#1524; taskbar z-order #11176/#7328/#5638, no app-wide z-order (discussion #9685).
  tao click-through internals: `windows/window.rs:530` (`WS_EX_TRANSPARENT`),
  `macos/window.rs:966` (`setIgnoresMouseEvents`), `linux/event_loop.rs:452` (empty input
  region); whole-window only, dynamic toggling via cursor-poll is the community pattern.
- **Native path:** tauri `unstable` raw `Window` (docs.rs 2.11.5); softbuffer alpha limitation
  (winit #2960 — `00000000RRRRRRRRGGGGGGGGBBBBBBBB`); wgpu-in-tauri transparency history
  (tauri #9220, closed not-planned).
- **Prior art:** SeakMengs/WindowPet, cskwork/pet-mochi, iiviie/cursor-pets, CrabNebula
  "Building a desktop pet with Tauri" tutorial — all webview-based, no Win/mac RAM figures
  published.
