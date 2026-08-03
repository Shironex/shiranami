# Shiranami v2 — Feature Ideation: Delight, Ritual & Companionship

**Lens:** the soft product surface — what makes someone open the app every evening and
tell a friend about it. Explicitly _not_ visuals-for-visuals (that is a separate lens) and
_not_ engine power (crossfade/EQ/gapless).

**Date:** 2026-08-03 · **Target:** v2 feature wave (Rust/Tauri rewrite complete, release held)

---

## Part 1 — Grounding: what already exists

### 1.1 The mascot is real but almost invisible

- Asset: `/Users/shirone/Documents/Projects/shiranami/apps/web/public/mascot.png`
  (mirrored in `apps/landing/`, `apps/desktop/resources/`).
- **It renders in exactly one place**:
  `/Users/shirone/Documents/Projects/shiranami/apps/web/src/components/shared/ViewEmptyState/ViewEmptyState.tsx`
  — the non-compact empty state, at 4.5rem, `opacity-70`, with the `float-mascot` CSS class.
- The only "life" it has is
  `/Users/shirone/Documents/Projects/shiranami/apps/web/src/components/shared/ViewEmptyState/MascotIdleNote/MascotIdleNote.tsx`
  — a single `Music2` glyph that drifts up from the headphones. Cadence is randomized per
  mount in `MascotIdleNote.hooks.ts` (first note at 5–11s, then 13–20s gaps), self-gated on
  `useReducedMotion`, `aria-hidden`, `pointer-events-none`.
- **So today the mascot only appears when the app has nothing to show you.** The companion
  is literally only present in absence. That is the single biggest untapped asset in the app.

Related precedent for "decorative flourish done right":

- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/useFavoriteCelebration.ts`
  — heart pop + burst ring, fires only on a genuine `false → true` toggle on the _same_
  track, gated behind `useDecorativeMotion`.
- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/components/onboarding/CompletionFlourish/`
  — four notes rise out of the Finish button, never on skip, never under reduced motion.
- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/useDecorativeMotion.ts`
  — the single gate: `!prefers-reduced-motion && !lowPerformanceMode`. **Every new flourish
  must route through this.**

### 1.2 Onboarding: an 8-step wizard with a genuine send-off

`/Users/shirone/Documents/Projects/shiranami/apps/web/src/components/onboarding/` —
Welcome → Folders → Tools → Appearance → Playback → Visualizer → Privacy → Summary.
Copy lives in `/Users/shirone/Documents/Projects/shiranami/apps/web/src/locales/en/onboarding.json`
and is genuinely excellent ("Your room is **ready**.", "A quick recap before the library
opens.", "Tap any scene · the rain stays."). Completion is a one-way boolean in
`/Users/shirone/Documents/Projects/shiranami/apps/web/src/stores/useOnboardingStore.ts`
(localStorage + a `app.onboardingCompleted` backend mirror), replayable from Settings.

**Gap:** there is a beautiful _arrival_ ritual and no _return_ ritual. Nothing happens when
you come back after three weeks away.

### 1.3 Microcopy house style is already established

`overview.json` is the tone benchmark: "Still up." / "The world's asleep." /
"A good night for slow records." / "Play something tonight and your week will start to take
shape." `toast.json`: "Off the shelf", "Noted — you won't hear that again", "Nothing close
enough in your library — yet.", "All caught up — nothing new to add."

**Rule for any new feature: observations, never prompts.** The existing voice never tells
the user to do anything. It notices things.

Full namespace list (EN + PL, both must be filled):
`/Users/shirone/Documents/Projects/shiranami/apps/web/src/locales/{en,pl}/` — 33 files.

### 1.4 History backend: richer than the UI currently uses

Rust: `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-db/src/repo/history/read.rs`
Commands: `/Users/shirone/Documents/Projects/shiranami/apps/desktop-tauri/src-tauri/src/commands/db_history.rs`
Wire types: `/Users/shirone/Documents/Projects/shiranami/packages/contracts/src/ipc/history.ts`
Renderer queries: `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/queries/useHistory.ts`

| Channel                          | Args                                          | Returns                                                      | Notes                                                                                                                    |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `db:history:record-play`         | `{trackId, playedSeconds, duration, source?}` | `PlayHistoryRecord`                                          | **`source` is free-form text, defaults `'library'`.** Only ever called with `'library'` today (`useAudioEngine.ts:270`). |
| `db:history:get-recent`          | `{limit?, since?}`                            | `ListeningHistoryEntry[]`                                    | limit clamped                                                                                                            |
| `db:history:get-summary`         | `{since?, until?}`                            | totals + top-5 tracks + top-5 artists                        | **`until` is exclusive** — closed windows already work                                                                   |
| `db:history:get-activity`        | `{since?}`                                    | `{date, playCount, listenedMinutes}[]` per UTC day           | **no `until`**                                                                                                           |
| `db:history:get-hourly-activity` | `{since?}`                                    | `{dayOfWeek, hour, playCount, listenedMinutes}[]` local-time | **no `until`**                                                                                                           |
| `db:history:get-weekly-insights` | `{since?}`                                    | `{sessionCount, topAlbums[]}`                                | session count is a **gap-based** SQL window function (>30 min idle = new session); there is no persisted session entity  |

Table: `play_history(id, track_id, played_at, played_seconds, completion_ratio, completed, source)`
— schema at `/Users/shirone/Documents/Projects/shiranami/packages/database/src/schema/play-history.ts`,
baseline SQL in `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-db/migrations/0001_baseline.sql`.

> **Load-bearing finding for Agent B:** `activity`, `hourly_activity` and `weekly_insights`
> take `since` only. Any _closed past window_ (last month's recap viewed in the middle of
> the next month, "this week last year") needs an `until` bind added. It is a ~3-line change
> per function in `read.rs` plus the arg struct in `db_history.rs` plus a `specta` bindings
> regen — mechanical, but it is real Rust work, not a renderer-only change. `get-summary`
> already has it and is the pattern to copy.

### 1.5 Overview is the sanctuary's front door and is already modular

`/Users/shirone/Documents/Projects/shiranami/apps/web/src/components/overview/` —
GreetingHero (time-of-day greeting + faux session summary + ClockCard + WeatherRow),
StatStrip/StatTile, TopThisWeek, ListeningClock (7×24 heatmap), TopAlbums, RecentlyAdded,
SmartMixesShelf, RecommendationsShelf.

Composed by `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/useOverviewData.ts`.

**Every widget already has an individual visibility toggle** in
`/Users/shirone/Documents/Projects/shiranami/apps/web/src/stores/useInterfaceStore.ts`
(`overviewStats`, `overviewTopWeek`, `overviewClock`, `overviewTopAlbums`, `overviewMixes`,
`overviewRecommendations`, `overviewRecentlyAdded`). **A new Overview widget gets its opt-out
for free by adding one key here.** This is the single most important fact for shipping soft
features without them feeling imposed.

Note in `GreetingHero.hooks.ts`:

```
* Renderer-side "current session" approximation. The app has no session
* concept, so v1 records the wall-clock moment playback first started in this
* launch and counts forward from there
```

— an explicit acknowledgement that sessions are faked. Also there: the `WATERMARK` map
(`朝 / 昼 / 今夜 / 夜`) — proof that context-driven glyph swapping is already an accepted
pattern in the greeting.

### 1.6 Sleep timer already fades — it just doesn't _mean_ anything yet

`/Users/shirone/Documents/Projects/shiranami/apps/web/src/stores/useSleepTimerStore.ts`:
presets 15/30/45/60/90 + custom 1–600, a 1s tick, and on expiry an equal-power gain ramp
(`playback._setSleepFading(true)` → engine ramps → `pause()`), with abort-on-manual-resume
handled. `sleepFadeDuration` is user-configurable (Settings · `SleepFadePreview`).

The mechanism for a wind-down ritual is **already built**. What is missing is everything
around it: dimming, calmer queue, quiet toasts, a closing line, and a next-launch
acknowledgement.

### 1.7 Weather + smart mixes: contextual awareness already ships

- `/Users/shirone/Documents/Projects/shiranami/packages/contracts/src/domain/weather.ts` —
  opt-in Open-Meteo, 8 coarse conditions, city + rounded coords only.
- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/queries/useSmartMixes.ts`
  passes `{hour, weather}` to the backend; `crates/shiranami-recommendation/src/core/mixes.rs`
  returns Focus / Late-night / Morning / Rainy-day / Sunny-day / Snowy-day / Best-of-decade.
- Copy already exists in `mixes.json` under `smart.*`.

**The context pipeline (hour + weather → mood) is live.** Anything that wants to say
"it's raining and it's 23:40" has the data already flowing.

### 1.8 Sharing, export, and the local-first ethos

- Deep-link sharing exists (`share.track` / `share.playlist` → a server-issued code, 24h
  expiry). `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/useShareLink.ts`.
- **`dialog_save_file` exists** —
  `/Users/shirone/Documents/Projects/shiranami/apps/desktop-tauri/src-tauri/src/commands/dialog.rs:191`.
  So a "save a PNG somewhere" flow needs no new native plumbing.
- No `html2canvas` / `satori` / `dom-to-image` anywhere. Rust has `image` 0.25
  (`Cargo.toml:204`) but no SVG rasterizer.
- Ambient color extraction from album art already exists:
  `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/useAmbientColor.tsx` +
  `usePrimaryRGB.ts`.
- Privacy stance in `onboarding.json > privacy` is explicit and strong: crash reports are
  **off by default**, no replay, usernames stripped from paths. **Any new feature that
  touches the network must be opt-in and say so in the same voice.**

### 1.9 What genuinely does not exist yet

`grep -rin "streak|pomodoro|ritual|wrapped|recap"` across `apps/web/src`, `crates/`,
`packages/` returns **zero product hits** (only the word "recap" in the onboarding summary
step, and "streak" as in splash-screen rain streaks).

Also absent: OS notifications (`tauri-plugin-notification` is **not** in `Cargo.toml`; the
installed plugins are single-instance, dialog, opener, updater, deep-link, os,
global-shortcut, autostart, sentry), any per-play annotation table, any persisted session
entity, any seasonal logic.

### 1.10 Precedent for a "gentle, once-only, persisted nudge"

`/Users/shirone/Documents/Projects/shiranami/apps/web/src/stores/useSupportBannerStore.ts`
— localStorage-persisted `seen` boolean, mirrored to the backend key/value store, with a
`reset()` for diagnostics and a one-way `hydrate` that only ever upgrades to seen.
**This is the template Agent B should copy for every "show this at most once / at most
weekly" surface below.** Built with
`/Users/shirone/Documents/Projects/shiranami/apps/web/src/lib/createPersistedStore.ts`.

Note: the backend key/value store narrows to a `RendererStoreKey` allowlist
(`crates/shiranami-core/src/store/keys.rs`) — adding a mirrored key is a Rust edit. Pure
localStorage stores need no backend change at all.

---

## Part 2 — External research: what makes cozy/companion software sticky in 2025–2026

**Finch (self-care pet)** — the canonical reference for retention without guilt. Its bird
_never dies_ and never scolds; missing days costs nothing. The pull is **curiosity and
appointment**, not obligation: after your tasks the pet leaves on a ~6-hour adventure, and
you come back later to _find out what it saw_. Deconstructor of Fun's breakdown names four
patterns: (1) living presence — the companion has continuous states, not a frozen image;
(2) appointment mechanics — timed outcomes create natural return windows without
notifications; (3) progress made concrete and visual; (4) micro-events mapped to natural
daily rhythms (morning check-in, evening chat) rather than constant nudges. Its stated
audience is "everyone else" — people who tried streak apps, felt judged by their phone, and
quit. That is precisely shiranami's user.

**Lofi/focus timers (Focusfloo, Lofi Pomodoro, lofi.town, Dot Focus)** — the winning framing
in 2026 is _"a simple ritual for focused time, without building a productivity system around
it."_ Flow: choose a mood → start → the timer guides the break. Emphasis on "focus with
intention rather than pressure". The differentiator is _low friction between intent and
action_, not feature count.

**Desktop pets (Shimeji, Neko '89, eSheep '95, Bongo Cat)** — a 35-year-old genre with no
sign of dying. What people love: low-effort companionship that runs passively while you
work, plus surprise. Bongo Cat rode to the top of Steam as _calming, low-pressure
entertainment that runs passively_. Shimeji's longevity came from being a folder of PNGs
that anyone could re-skin — community, not code.

**Wrapped fatigue** — Spotify Wrapped 2024 drew a genuine backlash ("the design and lack of
creativity genuinely keeps worsening each year"), and an entire cottage industry of
year-round alternatives (stats.fm, Spotify Pie, Musicboard, Audiolog, Musiary, Cue) exists
specifically because people want their listening reflected back **more than once a year and
without the marketing gloss**. Audiolog's pitch — "log your favorite songs for each day
along with what you were doing and how you were feeling" — is the emotional target.

**Music-evoked nostalgia** (Frontiers in Psychology 2026; PMC on default-mode/reward
activation) — music-evoked nostalgia measurably enhances memory vividness, autobiographical
recall, optimism, and self-continuity. A local library with years of `played_at` timestamps
is sitting on the single most potent emotional trigger in consumer software, and currently
uses it only to draw a bar chart.

**Wind-down / sleep design** (Fade Sleep Timer, Momental) — the pattern that works is
_"gentle fade so the sound drifts away once you're asleep"_ plus a **dimming environment**
(dim overlay, red night light) and _bedtime reminders as gentle nudges rather than alarms_.
Abrupt cutoffs are the named enemy.

**Cozy/calm as a retention strategy (2026 design commentary)** — "minimalism is a retention
strategy… in a market where every competitor is competing for attention with louder and
louder interfaces, calm is a real differentiator." On seasonal content: limited-time events
spike engagement but the hard part is _the trough between peaks_; cozy design balances
calmness with player agency without breaking the tone.

**Synthesis into design rules for shiranami:**

1. Presence over interaction. The companion should mostly do nothing, visibly.
2. Appointment over notification. Give people a reason to look, never a reason to feel late.
3. Continuity without a counter. People want the _feeling_ of a streak; the number is what
   poisons it.
4. The app writes the diary. Manual logging is a feature 5% of users will use; automatic
   memory is a feature 100% will feel.
5. Seasons, not holidays. Recurring beats missable.
6. Sharing is an export, never an account.

---

## Part 3 — Proposed features

Effort scale: **S** ≈ 1–2 focused days · **M** ≈ 3–6 days · **L** ≈ 1.5+ weeks.
Wow-per-effort is 1–5, judged as _emotional payoff relative to build cost_, not raw payoff.

---

### F1 — "Nami's notes": the mascot becomes a resident, not an error state

**Rank 1 · Effort M · Wow-per-effort 5 · Gimmick risk: HIGH (fully mitigable)**

**What it is.** Promote the mascot out of `ViewEmptyState` and give it a small permanent
seat — a corner of Overview, and optionally the compact/always-on-top player. It does almost
nothing. Its idle note (already built) hums a little more often while music is playing and
goes quiet when paused. And _occasionally_ — at most once per launch, with a hard floor of
several hours between lines — it has one short observation drawn from context the app
already knows:

- weather + hour: "Rain again. Good." · "You're up late."
- return after absence: "It's been a week. Your library missed you."
- a genuine milestone: "That's the hundredth time for this one."
- a pattern: "Third evening in a row you've ended on this album."
- and, most of the time, **nothing at all**.

**Why it deepens the sanctuary rather than gamifying it.** Every research thread points the
same way: companionship is _presence plus rare surprise_, not interaction. There is no tap
target, no badge, no reward, nothing to collect. The mascot never asks for anything and
never reports on your performance — it only notices. That is the difference between a
roommate and a productivity coach. It is also, bluntly, the feature people screenshot and
send to a friend, because it is the only thing in the category that has a _personality_
rather than a _palette_.

**Backend data / hooks it uses.** No new backend at all.
`useWeatherStore` + `useWeatherQuery` · `useCurrentHour` · `getTimeOfDay` /
`overviewUtils.ts` · `useHistoryQuery('7d')` · `track.playCount` from `useLibraryStore` ·
`useDecorativeMotion` · one new persisted store (copy `useSupportBannerStore`) holding
`lastLineAt`, `lastSeenAt`, and a small ring buffer of recently-shown line ids.

**Gimmick risk & mitigation.** A chatty mascot becomes hateful within a week. Mitigations,
all non-negotiable:

- Hard cadence cap enforced in the hook, not the component: **≤1 line per app launch** and
  **≥4h since the last line**, plus a random suppression roll so it is never predictable.
- Lines are **observations, never prompts** — never "why not add more music?".
- No line ever repeats until the pool has cycled.
- A single Settings toggle ("Nami · quiet / occasional") in Interface, defaulting to
  occasional, and the mascot itself is an `useInterfaceStore` key like every other widget.
- Lines fade in and out on their own; they are never dismissible-with-an-X (an X implies
  it was in the way).
- **Never on error states.** `ViewEmptyState` already forks on `isError` — respect it.
- Every line needs a PL translation that is _written_, not machine-translated. Budget for it.

---

### F2 — "This week, quietly": a recap that arrives on its own, year-round

**Rank 2 · Effort M · Wow-per-effort 5 · Gimmick risk: MEDIUM**

**What it is.** Once a week (Sunday evening, say), Overview grows one extra soft card above
the fold. No confetti, no percentile, no "you're in the top 1% of listeners". Five or six
lines in the house voice:

> **The week, in short.**
> 6h 40m across 11 sittings.
> You kept coming back to _Kiro_ — nine times.
> _Tokyo Rain_ carried Tuesday and Wednesday.
> Loudest at 23:00, as usual.
> Four new tracks found their way in.

It stays for two or three days, then folds itself away into a **Recaps shelf in History**
where past weeks stack up as a browsable archive. Same machinery yields a monthly card and
a single, quiet year-end one.

**Why it deepens the sanctuary rather than gamifying it.** This is Wrapped's _emotional_
payload with none of its marketing apparatus: it never compares you to anyone, never
projects an identity onto you, never asks to be shared, and never disappears if you miss it.
It is the app keeping a diary on your behalf. The Wrapped-alternative cottage industry
(stats.fm, Spotify Pie, Musicboard) is proof that demand for this is year-round and unmet by
an annual event.

**Backend data / hooks it uses.** Essentially all of it exists:
`db:history:get-summary` with **`since`+`until`** (already closed-window capable — see
`usePriorWeekMinutesQuery` in `useHistory.ts` for the exact pattern) · `get-weekly-insights`
(session count + top albums) · `get-hourly-activity` (the "loudest at" line — `overview.json`
already has `heatmap.loudest`) · `get-activity` (day shape) · `useOverviewData`'s
client-side `newInLibraryCount` off `track.createdAt`.

**Requires:** an `until` bind on `activity` / `hourly_activity` / `weekly_insights` in
`crates/shiranami-db/src/repo/history/read.rs` so a _past_ week can be recomputed exactly
when the archive is browsed. Plus one persisted store for "which week-ending dates have been
seen/archived", and one `useInterfaceStore` key (`overviewRecap`).

**Gimmick risk & mitigation.** The failure mode is "growth-hack notification in a calm app".

- **Never a modal, never a toast, never an OS notification.** It appears in place on
  Overview, at the same place, every time.
- It must **degrade honestly**: fewer than N plays in the week → no card at all, rather than
  a card that says "0h 0m". A recap of an empty week is a reproach.
- Numbers get prose, not badges: "eleven sittings", not `11 🔥`.
- No week-over-week arrows on the recap card (the StatStrip already carries the trend delta
  and has honest `trendNoComparison` copy — do not duplicate the comparison here).
- The archive must be reachable _without_ waiting for a card, or the card becomes bait.

---

### F3 — "Wind down": the sleep timer becomes a bedtime ritual with an ending

**Rank 3 · Effort M · Wow-per-effort 5 · Gimmick risk: LOW-MEDIUM**

**What it is.** A "Wind down" option alongside the sleep-timer presets. Choosing it does
more than schedule a pause — it authors the last stretch of the evening:

1. Over the final ~10 minutes, the UI **dims** progressively (the theme-background dim
   overlay already exists and is already user-tunable), visualizer intensity drops, and
   non-critical toasts go quiet.
2. The remaining queue is nudged toward the calmest tracks left — reuse the existing
   **Late-night** smart-mix scoring rather than inventing a new one.
3. The existing equal-power fade runs out to silence.
4. One line lands as the screen settles: _"Sleep well. I'll keep your place."_
5. **On the next launch, the greeting acknowledges it**: "You drifted off at 01:14 — picked
   up where you left off." Then it resumes exactly there.

**Why it deepens the sanctuary rather than gamifying it.** A sanctuary needs a way to _leave_
it, and right now leaving is a fade and a silence. Step 5 is the whole feature: it closes
the loop between two sessions, which is the thing that makes software feel like a place
rather than a tool. This is also the most defensibly "lofi player" feature on the list — no
streaming service will ever ship it because it has no engagement value.

**Backend data / hooks it uses.** `useSleepTimerStore` (endTime/remaining/fade already
built, including abort-on-manual-resume) · `usePlaybackStore.sleepFadeDuration` /
`_sleepFading` · `useThemeBgStore` (dim/blur/opacity) · `useUIStore` · smart mixes
`smart.lateNight` from `crates/shiranami-recommendation/src/core/mixes.rs` ·
`usePlaybackResume.ts` for the resume point · `GreetingHero.hooks.ts` for the morning-after
line. One persisted field: the timestamp and track of the last wind-down completion.

**Gimmick risk & mitigation.** The real risk is not gimmick, it is **looking like a bug**.

- Show an unambiguous, non-intrusive "Winding down · 8 min" state on the player so the
  dimming is legibly intentional.
- **Any interaction cancels it instantly** and restores full brightness — same contract the
  fade already honours when the user resumes.
- The queue nudge must be opt-in-able separately (some people want _their_ queue), and must
  never reorder tracks the user explicitly queued by hand.
- Never dim below a readable floor; respect `lowPerformanceMode` and `prefers-reduced-motion`
  by skipping the animated ramp and just applying the end state.
- The morning-after line must not fire if the user simply quit normally — only after a real
  wind-down completion.

---

### F4 — "On this night": listening memories out of your own history

**Rank 4 · Effort M (S without notes) · Wow-per-effort 5 for year-two users, 2 for new · Gimmick risk: MEDIUM**

**What it is.** An occasional small Overview row that surfaces a real memory from your own
`play_history`:

> **A year ago tonight** you were playing _Ame no Machi_ — fourteen times that week. ▷

Tap to play it. It only appears when there is a genuine anniversary with enough data behind
it. For users without a year of history, widen the aperture honestly: "three months ago",
"the week you first added this folder", "the first time you played this".

**Optional second half (this is what makes it a _journal_):** let the user attach a one-line
note to a play — "finished the thesis", "moving day" — which resurfaces with the memory
later. Entirely optional, never prompted for, no streak, no daily entry.

**Why it deepens the sanctuary rather than gamifying it.** This is the one feature only a
_local_ player can do well, because it needs years of your own uncurated history and nobody
else's. The nostalgia research is unambiguous: music-evoked nostalgia measurably boosts
memory vividness, self-continuity and optimism. A bar chart of the same data produces none
of that. It is also the highest "tell a friend" density per pixel on this list — "my music
player just reminded me what I was listening to last winter" is a story people repeat.

**Backend data / hooks it uses.** **Needs one new read.** A day-of-year match on
`play_history.played_at` — e.g. group plays where `strftime('%m-%d', played_at)` matches
today across prior years, joined to `tracks`, ranked by count. New function in
`crates/shiranami-db/src/repo/history/read.rs`, new `db_history_get_memories` command in
`apps/desktop-tauri/src-tauri/src/commands/db_history.rs`, new wire type in
`packages/contracts/src/ipc/history.ts`, bindings regen, plus a `useMemoriesQuery` alongside
the existing history queries. The optional notes need a `play_notes` table via a new
`0003_*.sql` migration (the migration system is clean sqlx — `0002_scrobble_queue.sql` is
the template).

**Gimmick risk & mitigation.**

- **Empty for a year.** Mitigate by shipping the widened aperture from day one, and by
  simply not rendering the row when there is nothing true to say (never "no memories yet" —
  that is a promise of future content, which is a growth pattern).
- **Memories can hurt.** A track tied to a bad period resurfacing unannounced is a real
  harm. Ship a quiet "not this one" dismissal that is _remembered permanently_ (reuse the
  `negative_signals` table's shape as prior art —
  `packages/database/src/schema/negative-signals.ts` — but keep it a separate concern).
- Cap frequency hard: at most one memory per few days, never two in a session.
- If notes ship: never prompt for one. The affordance should be discoverable in the track
  context menu and nowhere else. A journaling app that nags is a chore.

---

### F5 — "Stay a while": session intentions, and a real session record

**Rank 5 · Effort M · Wow-per-effort 4 · Gimmick risk: HIGH**

**What it is.** Optionally name what this listening is _for_ before or during it — a single
soft chip: **Focus · Wind down · Cleaning · Writing · Just listening**. Optionally attach a
soft duration ("check in with me in 50 minutes"). When the time passes, **nothing punitive
happens**: the progress ring completes, the mascot notes it, and offers two doors — keep
going, or wind down (hands off to F3). The session is recorded, so the recap can later say
"your longest focus sitting this week was 1h 12m" and the Listening Clock can be filtered by
purpose.

**Why it deepens the sanctuary rather than gamifying it.** The 2026 lofi-timer market has
converged on exactly this framing — _"a simple ritual for focused time, without building a
productivity system around it"_, "focus with intention rather than pressure". Naming your
purpose is a ritual; a countdown with a bell is a task. The distinction is entirely in the
ending: there must be **no completion sound, no score, no "session failed", no daily goal**.

It also fixes a real architectural wart: `GreetingHero.hooks.ts` explicitly notes the app
"has no session concept" and fakes one per launch, while `weekly_insights` derives sessions
by 30-minute gap heuristics in SQL. A first-class session makes both honest.

**Backend data / hooks it uses.** Two options, and the cheap one is genuinely viable:

- **Cheap (S–M):** `record_play`'s `source` column is free-form text defaulting to
  `'library'` and is only ever written as `'library'` today
  (`apps/web/src/hooks/useAudioEngine.ts:270`). Tagging it `'focus'` / `'wind-down'` gives
  per-purpose stats with **zero schema change** and zero new commands — only a
  `GROUP BY source` read later.
- **Proper (M):** a `listening_sessions` table (`0003_*.sql`) with id/purpose/started/ended,
  and a nullable `session_id` on `play_history`. Makes session stats exact instead of
  gap-inferred, and is what a "sessions" archive would want long-term.

Recommend shipping the `source`-tagging version first; it is reversible and proves the
feature before it earns a table.

**Gimmick risk & mitigation.** Highest on this list — this is where a calm player turns into
a productivity app.

- **Off by default.** One chip in the player bar, hidden behind an Interface toggle.
- Default state is **no duration** — the intention alone is the feature.
- No sound at the end. No modal. No "you completed 3 focus sessions today".
- Purpose labels must stay atmospheric, not corporate ("Just listening" must be one of them,
  and should be the default).
- Do not surface a sessions leaderboard anywhere. Sessions feed the recap's prose and
  nothing else.

---

### F6 — "Moment cards": opt-in PNG export, no accounts, no share buttons

**Rank 6 · Effort M · Wow-per-effort 4 · Gimmick risk: MEDIUM**

**What it is.** Any recap card (F2), memory (F4), top-5, listening clock, or now-playing
moment can be turned into a genuinely beautiful PNG: the app's own display/serif/mono type
stack, the kanji watermark, the accent colour pulled from the album art by the existing
ambient-colour extraction, a small `白波` mark in the corner. Two actions only: **Save
image…** and **Copy image**. Nothing uploads, no link is minted, no service is contacted.

**Why it deepens the sanctuary rather than gamifying it.** This is how a local-first app
spreads without betraying its ethos: the user makes an artefact and decides where it goes.
Ink & Switch's local-first essay names exactly this as the recommended sharing primitive for
local-first software — export a widely-supported format, share it however you already share
things. It also just feels good to make; the card is a small reward for the listening, not a
funnel.

**Backend data / hooks it uses.** `dialog_save_file` already exists
(`apps/desktop-tauri/src-tauri/src/commands/dialog.rs:191`) — no new native plumbing.
`useAmbientColor.tsx` / `usePrimaryRGB.ts` for the palette. Album art is already served over
the local axum byte server (`crates/shiranami-serve`). Data comes from whatever card is being
exported.

**Gimmick risk & mitigation.**

- **No social buttons.** No "Share to X", no prefilled caption, no hashtag. The moment a
  platform logo appears, the feature changes species.
- **Do not screenshot the DOM.** There is no `html2canvas` in the tree and adding one would
  produce a blurry, cropped, theme-dependent artefact. Render the card on a dedicated
  `<canvas>` at 2× with its own layout — more work, but the output quality _is_ the feature.
  Budget for font loading (`document.fonts.ready`) before draw, or the type silently falls
  back.
- Watermark must be tasteful and small — a mark, not an ad.
- Must handle missing album art (the `OverviewCover` deterministic gradient + glyph fallback
  is the pattern to reuse) and very long titles.

---

### F7 — "Seasons": the sanctuary notices the year turning

**Rank 7 · Effort M–L (art-bound) · Wow-per-effort 4 · Gimmick risk: MEDIUM-HIGH**

**What it is.** Four or five times a year the room changes almost imperceptibly, on its own:

- the greeting watermark kanji gains a seasonal layer alongside the existing
  `朝 / 昼 / 今夜 / 夜` (`春 / 梅雨 / 夏 / 秋 / 冬`);
- the splash's falling rain becomes snow in deep winter, petals in spring — the particle
  system, the streak physics and the reduced-motion gating **already exist**
  (`useSplashRain.ts`, `SplashDroplets/`);
- a seasonal smart mix quietly appears ("First cold night", "Long light");
- an optional "follow the season" theme mode — the theme set is _already_ seasonal
  (`'snow' | 'summer' | 'sunset' | 'wisteria' | 'lofi-night'`);
- two or three seasonal lines join Nami's pool (F1).

**No event calendar. No limited-time unlocks. Nothing missable.**

**Why it deepens the sanctuary rather than gamifying it.** Seasonal change is the oldest
ritual there is and it rewards _having the app installed_, not grinding it. The 2026 cozy-app
commentary is explicit that limited-time events spike engagement and then leave a trough;
seasons have no trough because they return. Crucially: **seasons, never holidays.** No
pumpkins, no santa hats. Atmosphere, not iconography — which is also the only version
consistent with a Japanese-named app whose whole visual language is restraint.

**Backend data / hooks it uses.** `WATERMARK` map in `GreetingHero.hooks.ts` ·
`useSplashRain.ts` + `SplashDroplets/` · `useThemeStore.ts` (`THEME_IDS` already includes
snow/summer/sunset/wisteria) · `crates/shiranami-recommendation/src/core/mixes.rs` (already
takes `hour` + `weather`; add month/season to the same signal bundle) · `useCurrentHour.ts`
as the tick precedent. **No new backend data.**

**Gimmick risk & mitigation.**

- Kitsch is the whole risk. Rule: **if it could appear on a greeting card, cut it.**
- Ship one season properly rather than five badly. Winter (snow) is nearly free given the
  existing `'snow'` theme and the splash particle system.
- Single Settings toggle, and it must respect `lowPerformanceMode` (the splash already does).
- Southern hemisphere: derive season from month + a hemisphere hint, or offer a manual
  override. Getting this wrong makes the feature feel careless to a third of the world.

---

### F8 — "First light": a return ritual to mirror the onboarding send-off

**Rank 8 · Effort S · Wow-per-effort 3 · Gimmick risk: MEDIUM**

**What it is.** After a genuinely long absence (three weeks or more), the first Overview
carries one soft panel — the mirror image of the onboarding's "Your room is ready":

> **Welcome back.**
> Your library is 4,318 tracks — twelve arrived while you were away.
> You left off in _Slow Water_, forty seconds in.
> [ Pick it up ]

One button. Dismissible. Never shown twice for the same absence.

**Why it deepens the sanctuary rather than gamifying it.** Coming back to a music app
currently feels like facing a backlog. This makes it feel like being greeted. It is
explicitly _not_ a re-engagement mechanic because it can only ever be seen **after** the user
has already returned on their own — there is no notification, no email, nothing that reaches
out.

**Backend data / hooks it uses.** No new backend. `useOverviewData`'s `newInLibraryCount` /
`recentlyAdded` (client-side off `track.createdAt`) · `db:history:get-summary` for totals ·
`usePlaybackResume.ts` for the left-off track and position · one persisted `lastSeenAt`
(copy `useSupportBannerStore`).

**Gimmick risk & mitigation.**

- **Never guilt language.** No "you haven't listened in 24 days", no "we missed you", no
  sad-mascot art. State facts about the library, not about the user's absence.
- Threshold must be high (3+ weeks) or it becomes a weekly nag.
- If nothing changed while they were away, say nothing — a "welcome back, nothing happened"
  panel is worse than silence.

---

### F9 — "Kept company": continuity without a counter

**Rank 9 · Effort S · Wow-per-effort 3 · Gimmick risk: LOW (but risks being invisible)**

**What it is.** The deliberate anti-streak. No number, no flame, nothing to break. Instead
the Listening Clock gains one line of prose that names the _shape_ of your habit:

- "You've been here most evenings this month."
- "Weekends, mostly. That's a whole mood."
- "Quiet week. That's fine too."

And when you return after a gap, the acknowledgement is warm rather than reproachful.

**Why it deepens the sanctuary rather than gamifying it.** Streaks are the single fastest way
to poison a sanctuary — Finch's entire differentiator is that its pet never dies and the app
never judges, explicitly built for people who "felt judged by their own phone and gave up".
What people actually enjoy about streaks is the _sense of continuity_, which is separable
from the loss-aversion that drives retention. This ships the first without the second.

**Backend data / hooks it uses.** Nothing new — `db:history:get-activity` already returns
plays per day, which is exactly the input. Classification (evening-person / weekend-person /
everyday-person / sparse) is a pure function over that array, testable in isolation, and
belongs in `overviewUtils.ts` next to `buildHeatmap`.

**Gimmick risk & mitigation.**

- The risk is the opposite of gimmicky — it is **so** subtle it reads as nothing. Mitigate by
  giving it a home: it should be the ListeningClock's subtitle _and_ a line in the weekly
  recap (F2), so it lands somewhere with weight.
- Phrasings must be genuinely distinct per pattern, or it degenerates into one generic
  sentence that feels auto-generated.
- "Quiet week. That's fine too." must fire for zero-play weeks too. If the copy only exists
  for good weeks, the silence in bad weeks _is_ the judgement.

---

### F10 — "Hum with me": make the mascot's hum audible (opt-in, very rare)

**Rank 10 · Effort S · Wow-per-effort 4 (raw) / 2 (risk-adjusted) · Gimmick risk: VERY HIGH**

**What it is.** Today the "hum" is purely visual — one drifting note glyph. Make it real: a
~2-second recorded hum, mixed roughly 30 dB under the music, at most once every few hours,
only while something is playing, **off by default** behind an explicit Settings toggle.

**Why it deepens the sanctuary rather than gamifying it.** If it lands, it is the single most
memorable two seconds in the product — the thing someone describes to a friend out loud. The
whole desktop-pet genre survives on exactly this kind of rare, purposeless surprise.

**Backend data / hooks it uses.** The Web Audio graph already exists in the renderer and
survives the Tauri port untouched (`useAudioEngine.ts`, `audioAnalyser.ts` — v2 architecture
§1.1 is explicit that the audio engine stays in the renderer). A one-shot buffer routed
through the existing context is straightforward. One asset, one toggle.

**Gimmick risk & mitigation.** Listed last because **unrequested audio in a music player is
the riskiest thing on this page.** If shipped at all:

- Off by default, opt-in only, with the toggle worded honestly.
- Never during the sleep-timer fade, never during wind-down (F3), never while a phone call /
  system audio focus event is active, never in compact mode.
- The volume must be genuinely subliminal, and it must duck rather than layer.
- **Honest recommendation:** treat this as a stretch item for _after_ F1 ships and the
  mascot's cadence has been lived with for a release. If the visual hum already annoys
  anyone, the audible one is a non-starter.

---

## Part 4 — Ranking, dependencies, and a suggested wave

| #   | Feature                                             | Effort | Wow/effort     | Gimmick risk | New backend?                     |
| --- | --------------------------------------------------- | ------ | -------------- | ------------ | -------------------------------- |
| 1   | **Nami's notes** — mascot as resident               | M      | 5              | High         | None                             |
| 2   | **This week, quietly** — year-round recap + archive | M      | 5              | Medium       | `until` bind on 3 reads          |
| 3   | **Wind down** — sleep timer as bedtime ritual       | M      | 5              | Low-Med      | None                             |
| 4   | **On this night** — listening memories              | M      | 5 (year 2)     | Medium       | 1 new read (+1 table if notes)   |
| 5   | **Stay a while** — session intentions               | M      | 4              | High         | None (via `source`)              |
| 6   | **Moment cards** — opt-in PNG export                | M      | 4              | Medium       | None (`dialog_save_file` exists) |
| 7   | **Seasons** — the year turning                      | M–L    | 4              | Med-High     | None                             |
| 8   | **First light** — return ritual                     | S      | 3              | Medium       | None                             |
| 9   | **Kept company** — continuity without a counter     | S      | 3              | Low          | None                             |
| 10  | **Hum with me** — audible hum                       | S      | 4 raw / 2 adj. | Very high    | None                             |

**Dependencies and synergies** (these compound — build in this order and each is cheaper
than its standalone estimate):

- **F1 → F4, F8, F9, F7.** The mascot line-selection engine (cadence cap, pool, suppression)
  is shared infrastructure. Memories, the return greeting, the continuity line and the
  seasonal lines all become _content_ for an engine that already exists.
- **F2 → F6.** The recap card is the obvious first thing anyone wants to export. Ship F2
  first, and F6's canvas renderer has an immediately valuable subject.
- **F5 → F2.** Sessions with a purpose make the recap's prose materially richer ("your
  longest focus sitting"). Build the recap first from the data that already exists, then
  enrich it.
- **F3 → F8.** Wind-down's next-launch acknowledgement and the return ritual are the same
  surface (the greeting) and the same store shape (`lastSeenAt` / `lastWindDownAt`).
- **F9 folds into F2.** It is arguably not a separate feature — it is one line in the recap
  plus one line under the Listening Clock. Consider merging.

**Suggested wave for the v2 release:** F1 + F2 + F3 as the headline trio (personality,
memory, ending), with F9 folded into F2 as a free line. F4 and F6 as the second wave once
the mascot engine and recap card exist to hang them on.

---

## Part 5 — Cross-cutting implementation notes for Agent B

1. **Every new Overview widget must add a key to
   `/Users/shirone/Documents/Projects/shiranami/apps/web/src/stores/useInterfaceStore.ts`.**
   That store is a pure opt-out surface defaulting to visible; it is how these features avoid
   feeling imposed. Free of charge, and non-negotiable.
2. **Every flourish routes through `useDecorativeMotion()`**, not `useReducedMotion()`
   directly — the low-performance escape hatch matters as much as the OS preference.
3. **Copy is the feature.** Every string needs an EN _and_ a hand-written PL entry in
   `apps/web/src/locales/{en,pl}/`. For F1 specifically the PL lines cannot be a translation
   of the EN lines — the tone has to be re-authored. Budget for this explicitly; a
   half-translated mascot is worse than no mascot.
4. **Component convention is enforced by lint.** The repo has an eslint rule rejecting
   components not in their own folder (see commit `0ff44ea7`), and the established shape is
   6 files per component: `X.tsx` / `X.hooks.ts` / `X.types.ts` / `X.stories.tsx` /
   `X.test.tsx` / `index.ts`. `MascotIdleNote/` is the reference implementation for a small
   decorative component including its `IXProps` empty-interface convention.
5. **Storybook play + a11y tests are the house standard** for anything decorative — see
   `CompletionFlourish.stories.tsx`, which asserts `aria-hidden`, `pointer-events-none`, and
   that no role/name reaches the a11y tree.
6. **Rust-side additions** (`until` binds, a memories read, a `0003_*.sql`) each need:
   the repo function in `crates/shiranami-db/src/repo/history/`, the command +
   arg struct in `apps/desktop-tauri/src-tauri/src/commands/db_history.rs`, the wire type in
   `packages/contracts/src/ipc/history.ts`, a `specta` bindings regen into
   `packages/contracts/src/generated/bindings.ts` (committed + CI-diffed), and the bridge
   namespace entry in `apps/web/src/lib/bridge/namespaces/db.ts`. Five files minimum per
   channel — size estimates above account for this.
7. **No OS notifications.** `tauri-plugin-notification` is deliberately absent from
   `Cargo.toml`. None of these features should add it. Every surface above is in-app and
   only ever seen because the user opened the app.
8. **Vitest `.rejects` is broken in `apps/web`** (known version mismatch) — use manual
   try/catch for rejection assertions.
9. **Test the cadence logic, not the animation.** The valuable tests here are pure functions:
   "does the line selector respect the 4h floor", "does the recap suppress under N plays",
   "does the habit classifier return `weekend` for this activity array". Put them next to
   `overviewUtils.test.ts`.

---

## Part 6 — Top 3 release-notes pitches

**1 · Nami's notes**

> Nami has moved in. She mostly just floats there and hums along — but every so often she
> notices something: the rain, the hour, the album you keep coming back to.

**2 · This week, quietly**

> On Sunday evenings, your Overview writes down how the week sounded — hours, the track you
> kept returning to, your loudest hour. It keeps every one of them.

**3 · Wind down**

> A sleep timer that knows how to end an evening: the room dims, the music softens to the
> quietest thing left in your queue, and tomorrow it remembers where you drifted off.

---

## Sources

- [Deconstructor of Fun — How Wellness App Finch Uses Gamified Widgets to Drive Retention](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl)
- [TechAnjan — Finch Review: Boosting Productivity Without the Shame Factor](https://techanjan.com/finch-review-boosting-productivity-without-the-shame/)
- [Together with Kai — The 10 Best Habit Tracker Apps of 2026 (and Why Most People Quit)](https://togetherwithkai.com/blog/best-habit-tracker-apps)
- [Lofi Pomodoro — Lofi Timer: What It Is, Why It Works, and How to Use It](https://lofipomodoro.com/blog/lofi-timer/)
- [Focusfloo — Best Aesthetic Pomodoro Timers in 2026](https://focusfloo.com/blog/best-aesthetic-pomodoro-timers-2026)
- [OpenPets — 7 Best Bongo Cat Alternatives in 2026 (Free Desktop Pets)](https://openpets.dev/alternatives/bongo-cat)
- [OpenPets — 7 Best Shimeji Alternatives in 2026](https://openpets.dev/alternatives/shimeji)
- [NEWM — It's a Wrap on Spotify Wrapped](https://newm.io/spotify-wrapped-2025-decline-and-best-alternatives/)
- [ReHack — 9 Spotify Wrapped Alternatives (See Your Wrapped Data Throughout the Year)](https://rehack.com/culture/9-spotify-wrapped-alternatives-see-your-wrapped-data-throughout-the-year/)
- [Achriom — Best Music Tracking Apps in 2026: Last.fm, RateYourMusic & More](https://www.achriom.com/blog/best-album-tracking-apps/)
- [Audiolog — music journal app](https://play.google.com/store/apps/details?id=com.audiolog.app)
- [Frontiers in Psychology (2026) — Evoking nostalgia by presenting hit-song lists](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1800653/full)
- [PMC — Music-Evoked Nostalgia Activates Default Mode and Reward Networks](https://pmc.ncbi.nlm.nih.gov/articles/PMC11907061/)
- [Luminate — Nostalgic Music Listening Is On the Rise](https://luminatedata.com/blog/nostalgic-music-listening-is-on-the-rise-how-should-brands-lean-in/)
- [Momental — sleep sounds app with fade-out and bedtime reminders](https://momental.ai/)
- [Fade Sleep Timer (Google Play) — gentle fade + dim overlay wind-down](https://play.google.com/store/apps/details?id=com.gollan.fadesleeptimer)
- [Intuitia — App Design Trends 2026: What's Actually Working](https://www.intuitia.tech/blog/app-design-trends)
- [Phiture — How to Leverage Seasonal Featuring](https://phiture.com/asostack/seasonal-aso-strategies/)
- [Ink & Switch — Local-first software: You own your data, in spite of the cloud](https://www.inkandswitch.com/essay/local-first/)
- [Emrld Labs — Privacy-First App Design: Why We Skip Analytics and Accounts](https://emrldlabs.com/blog/privacy-first-app-design/)
