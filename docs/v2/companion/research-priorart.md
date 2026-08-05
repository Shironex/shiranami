# Shiranami v2 — Companion Research: Prior Art & Progression Mechanics

**Lens:** the desktop pet / companion that grows as you listen — what the genre has
learned in 35 years, what an in-house reference already exists, and which progression
mechanics fit a calm, local-first music player without corrupting its own data.

**Date:** 2026-08-05 · **Target:** v2 companion feature (builds on
`docs/v2/feature-wave/research-delight.md` F1 "Nami's notes" — read that first; this doc
assumes it)

---

## Part 1 — Grounding: what already exists

### 1.1 Shiranami's side (recap of the delight doc, companion-relevant slice)

- The mascot exists (`apps/web/public/mascot.png`) and renders only in
  `ViewEmptyState` — present only in absence. F1's plan promotes it to a resident with a
  cadence-capped line engine. **The companion should be the same character and the same
  engine, not a second creature.** Two mascots is a brand bug.
- The XP-relevant data is already recorded, locally, with no new backend:
  `play_history(track_id, played_at, played_seconds, completion_ratio, completed, source)`
  (`packages/database/src/schema/play-history.ts`), gap-based session counting in
  `db:history:get-weekly-insights`, per-day activity in `get-activity`, and a free-form
  `source` column written only as `'library'` today.
- Analysis state lives on tracks: `loudnessLufs` in
  `packages/database/src/schema/tracks.ts` is explicitly "`null` = not yet analysed" —
  a backfill batch is a countable, finishable event. The native C++ ladder (waveform →
  LUFS → BPM) will add more of these.
- Curation surfaces: `playlists.ts`, `playlist-tracks.ts`, `smart-playlists.ts`,
  favorites, `folders.ts` scans.
- Sanctuary Mode is a real, persisted state (`apps/web/src/stores/useSanctuaryStore.ts`)
  with auto-enter timing; the sleep timer already has a completed "wind-down" moment.
- House rules that bind this feature: `useDecorativeMotion` gate, `useInterfaceStore`
  opt-out keys, **no OS notifications ever** (plugin deliberately absent), observations
  never prompts, EN + hand-written PL copy.

### 1.2 The in-house reference: ShiroAni's mascot (closest prior art we own)

ShiroAni ships a real desktop-overlay mascot. It is **images only — presence without a
behavior engine** — and that is exactly why it's instructive.

**Assets.**

- Bundled sprite: `apps/desktop/resources/mascot/chibi_base.png` — a single 256×256
  chibi frame (~54 KB). That's the entire shipped animation budget.
- Pose set (marketing/landing, not the overlay): `mascot-wave.png`, `mascot-think.png`,
  `mascot-sleep.png` — each 256×256, in `apps/landing/public/` and
  `shiroani-design/assets/`. Three poses cover an entire landing page's worth of
  personality. **Pose-swapping beats frame animation on cost/charm ratio.**

**Engine.** (`apps/desktop/src/main/mascot/` in the shiroani repo)

- Windows-only native C++ addon (`desktop_overlay.node`, source
  `apps/desktop/src/native/desktop_overlay.cpp`) driving a GDI+ layered window.
  `overlay.ts:69` bails on `process.platform !== 'win32'` — **macOS gets nothing.**
- The JS contract plumbs an 8-frame horizontal strip at 100 ms
  (`MASCOT_FRAME_COUNT = 8`, `MASCOT_ANIM_INTERVAL = 100` in `overlay-state.ts`), but the
  native loader deliberately renders only frame 0 of multi-frame inputs ("animation
  playback is out of scope for the layered window's UpdateLayeredWindow loop"). Strip
  animation exists as API surface (`setAnimation`, `setAnimationEnabled`), shipped static.
- Display size 48–512 px (default 128), scale modes mirroring CSS `object-fit`
  (contain/cover/stretch), per-pixel alpha hit-testing, drag with saved+lockable
  position, native right-click context menu (`open-app`, `navigate:<view>`, hide, lock,
  quit), and a `'tray-only'` visibility mode — **the mascot appears when the main window
  is minimized**, i.e. it keeps you company precisely when the app is out of sight.
- User re-skinning is first-class: pick any PNG into `userData/mascot-sprites/`, served
  via a `shiroani-mascot://` protocol, persisted in electron-store, mirrored to a
  renderer store (`useMascotSpriteStore.ts`) for the Settings preview
  (`MascotPreview/`, `MascotSection/`).

**What it teaches shiranami:**

1. A static frame + drag + context menu is already companionship. Nobody has complained
   that the chibi doesn't walk. Behavior engines are optional; _presence_ is the product.
2. The Windows-only native addon is the wrong port target. Tauri can do an always-on-top
   transparent decoration-free WebView window cross-platform — the overlay becomes a tiny
   React surface reusing the web mascot component, not C++. (Ship the **in-app** seat
   first regardless; the OS overlay is a later, separate deliverable.)
3. Re-skinning as a user feature (ShiroAni) and as a community feature (Shimeji, below)
   is the cheapest longevity mechanic in the genre. The scale-mode + protocol-URL +
   self-healing-persistence plumbing is directly portable thinking.
4. `'tray-only'` mode is a genuinely original idea worth stealing: the companion that
   only exists when the app is minimized turns "app in background playing lofi" — the
   core shiranami use case — into the mascot's main stage.

---

## Part 2 — Prior art: 35 years of desktop pets

| Pet                  | Era   | What it does                              | Why it charms                                        | Why it annoys / died                     | License            |
| -------------------- | ----- | ----------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | ------------------ |
| Neko                 | 1989  | Cat chases the cursor                     | Reacts to _your_ real movement                       | One trick; broke with OS changes         | various clones     |
| eSheep               | 1995  | Sheep wanders, falls off windows          | Uses real desktop as terrain                         | Interferes with work; abandoned          | orig. freeware     |
| Shimeji / Shimeji-ee | 2009→ | Climbs windows, multiplies, XML behaviors | Community re-skins (folder of PNGs)                  | Steals windows, clones spam, Java weight | zlib / **New BSD** |
| Bongo Cat (Steam)    | 2025→ | Slaps taskbar when you type               | Reacts to real activity; zero demands                | Never moves; hat drops reward idling     | proprietary        |
| Desktop Mate         | 2025→ | 3D anime companion on taskbar             | Production polish                                    | Feature-thin, paid DLC characters        | proprietary        |
| vscode-pets          | 2021→ | Pets in an editor panel, throw ball       | Contained in its own panel; pets befriend each other | Nothing to come back for                 | **MIT**            |
| claude-buddy         | 2026  | ASCII pet in Claude Code statusline       | Reacts to end-of-turn, errors, big diffs             | — (young)                                | **MIT**            |

### 2.1 claude-buddy (github.com/1270011/claude-buddy) — the activity-hook reference

A terminal ASCII companion for Claude Code, rebuilt via MCP after the official one was
removed. Not a graphical pet at all — the lessons are architectural:

- **It hooks real work, not timers.** Five mechanisms: an MCP server prompting a
  `buddy_react` call at turn completion; a PostToolUse hook that detects errors, test
  failures, and large diffs; a Stop hook as fallback; a skill for `/buddy` commands; and
  a statusline renderer. The buddy's emotional state is a function of _what actually
  happened_, which is why its reactions land. Shiranami's equivalent seam: playback and
  library events (track completed, session ended, scan finished, analysis batch done) —
  all already flowing through stores/IPC.
- **Tiny footprint by design.** It lives in the statusline — one line, right-aligned.
  Three idle frames plus a blink. The entire animation budget is smaller than ShiroAni's.
- **Identity persists** (derived from account UUID) so the same buddy survives
  reinstalls. A companion that resets is a betrayal; shiranami's companion state must
  live in the backend store, not localStorage alone.
- **Stats as personality, not progression:** five fixed stats (DEBUGGING, PATIENCE,
  CHAOS, WISDOM, SNARK) + rarity color. Leveling/XP is only on the roadmap — it shipped
  and got loved _without_ progression.
- MIT licensed — patterns and even code are referenceable.

### 2.2 Shimeji lineage — the community lesson and the annoyance lesson

Created 2009 by Yuki Yamada (Group Finity); the original is abandoned, the Shimeji-ee
fork (Kilkakon) lives on. Behaviors are XML-defined sequences over folders of numbered
PNG frames — and that folder-of-PNGs simplicity, not the engine, is why thousands of
DeviantArt artists made shimejis and kept the genre alive for 17 years.

The annoyance side is equally well documented: shimejis climb over your windows, grab
and throw them, and multiply until the screen is chaos. It's delightful in a demo and
uninstalled within a week by anyone who works on their machine. **The failure mode of
the genre is interference.** Every pet that touches the user's actual workspace
(windows, cursor, taskbar) eventually gets closed; every pet that stays in its own seat
(vscode-pets' panel, Bongo Cat's fixed perch, claude-buddy's statusline) gets to stay.

Licensing: original Shimeji is zlib/libpng, Shimeji-ee source is New BSD — both
compatible with the Shiranami Source Available License as _reference or ported code_.
**Community shimeji art packs are not**: DeviantArt packs are near-universally
personal-use-only, per-artist terms. All companion art must be original/commissioned
(the ShiroAni chibi pipeline already exists). Forks vary — verify each (some Linux
forks and eSheep reimplementations carry GPL); do not port code from any fork without
reading its LICENSE first.

### 2.3 Bongo Cat — the reactive-presence lesson and a warning

Peaked at ~194k concurrent Steam users: a cat that drums when you type. The charm is
pure input-reactivity — it mirrors your real activity with zero demands. The criticism
("the cat never goes anywhere") shows reactivity alone isn't companionship.

The warning is its retention mechanic: hats drop _while the app runs_, with printed
odds, tradeable for real money. It explicitly rewards **leaving it running** — which for
Bongo Cat is harmless and for shiranami would be fatal: any reward proportional to
app-open time teaches users to leave music playing silently, and every one of those
fake plays flows into `play_history` and poisons the recommendation engine. **This is
the single hardest constraint on the XP design** (see Part 3.3).

### 2.4 vscode-pets — presence without progression

MIT, beloved, zero XP. Pets sit in a dedicated panel (never over code), you can throw a
ball, and two pets befriend each other (a ❤️ then chase). Proof that a contained seat +
one interaction + occasional emergent moment is enough. Its gap is shiranami's
opportunity: there is nothing to come back _for_ — no memory, no growth, no
relationship to the work you did. A music companion with taste-memory has exactly what
vscode-pets lacks.

---

## Part 3 — Progression mechanics: what works, what poisons

### 3.1 The nurturing-loop spectrum

- **Tamagotchi (1996)** proved care loops bond people to pixels — and that the bond is
  driven by guilt: it ran while you were away, neglect had dire visible consequences,
  and "failing a dependent creature" created stronger reinforcement than any game
  mechanic. That moral pressure is precisely what a sanctuary cannot contain.
- **Duolingo** industrialized the guilt: streaks + a mascot whose sadness is a
  retention tool. The documented backlash and the design corrective are the same
  sentence: _users who feel judged stop returning; celebrate the return, never the
  absence._
- **Forest** is loss-aversion made cute (your tree dies if you leave) — effective, and
  criticized for layering guilt onto an existing habit. Note it punishes _leaving_;
  a music player's companion must never punish either staying away or silence.
- **Finch** (covered in the delight doc) is the anti-Tamagotchi that won: the bird
  never dies, missing days costs nothing, and the pull is curiosity (what did it see on
  its adventure?) — appointment mechanics without notifications.
- **Stardew Valley / Animal Crossing** point at the right texture: friendship hearts
  fill through small repeated kindnesses, decay is negligible, and — the key detail —
  **decay stops entirely at max hearts**. Progress is a ratchet; the relationship, once
  earned, is safe. Villagers greet you warmly after months away. Companion "juice" is
  in the greeting animation and the occasional gift, not in numbers.

### 3.2 XP sources that fit shiranami (all local, all already recorded)

Design principle: **moments, not minutes.** Every source below is a discrete event with
a natural cap, not an accumulating meter of elapsed time.

| Source                                                                   | Signal (existing)                             | Weight                             | Cap                          |
| ------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------- | ---------------------------- |
| Completed listen                                                         | `play_history.completed` / `completion_ratio` | base unit                          | diminishing after ~N/day     |
| Listening session                                                        | gap-based session (per `weekly_insights` SQL) | medium                             | 1 credit per session, ~3/day |
| Discovery: first-ever play of a track                                    | first `play_history` row per `track_id`       | high                               | naturally self-capping       |
| Discovery: first play of a new artist/album                              | derived from tracks metadata                  | high                               | self-capping                 |
| Curation: playlist created / grown                                       | `playlists`, `playlist_tracks`                | small, one-time per milestone      | e.g. 1st/5th/10th playlist   |
| Favoriting (genuine `false→true`, same gate as `useFavoriteCelebration`) | favorites                                     | small                              | daily cap                    |
| Analysis batch completed                                                 | `loudnessLufs` backfill; waveform/BPM rungs   | one-time milestone                 | per-batch                    |
| Library ritual: folder scan with new tracks found                        | `folders` scan events                         | small                              | per-scan                     |
| Wind-down completed                                                      | sleep-timer completion (delight F3)           | small                              | 1/day                        |
| Sanctuary sitting                                                        | `sanctuaryActive` sessions ≥ N min            | small                              | 1–2/day                      |
| Continuity ("kept company")                                              | day-shape classification (delight F9)         | ambient — affects mood, **not** XP | —                            |

Deliberately **excluded**: raw minutes listened (idle-farmable), app-open time
(Bongo Cat trap), streak counts (guilt engine), anything requiring the companion to be
looked at (attention farming).

### 3.3 The idle-listening integrity constraint (load-bearing)

Because recommendations are driven by `play_history` affinity, the companion must never
create an incentive to generate fake listening. Concretely:

1. **No XP from elapsed time.** Only from events with a completion semantic
   (`completed` plays, closed sessions, one-time firsts).
2. **Daily soft cap + diminishing returns** so a 10-hour silent loop earns barely more
   than a real evening. Grinding must be mathematically pointless.
3. **Weight diversity over volume**: the 1st play of a track is worth more than the
   40th; a session touching 3 artists outranks one track on repeat. This aligns the
   companion's incentives _with_ the recommendation engine (more genuine signal) instead
   of against it.
4. Do **not** add mute/volume detection as an anti-cheat — lofi is legitimately
   background, low-volume music, and policing it reads as surveillance. The cap
   structure above makes cheating unrewarding without judging anyone.
5. **Never display "minutes listened" as the level bar.** The moment time-listened is
   the visible score, people optimize it.

### 3.4 Level curve shape

Standard game-progression practice: fast early, slow late (quadratic-to-exponential
cost curves, tuned so early levels land in minutes and late ones in weeks). For a
companion, take the _shape_ and drop the _numbers_:

- **8–10 named growth stages, not numbered levels.** A stage is visible in the
  companion itself — posture, a new idle animation, a small accessory, where it sits —
  ShiroAni's 3-pose landing set proves how little art each stage needs (one 256×256
  pose per stage is a viable floor).
- **First 2–3 stages inside the first week** (the hook: onboarding → first session →
  first discovery). Middle stages over ~a month. Final stages asymptotic — months of
  ordinary listening, reached by everyone eventually, rushed by no one. Roughly
  quadratic cost early flattening toward logarithmic gain; exact constants matter less
  than the feel (tune in playtest, per standard practice).
- **A ratchet, never a decay.** Stages are permanent (the Stardew max-hearts lesson).
  No prestige, no reset, no seasonal ladder.
- **Level-ups are quiet.** No modal, no confetti, no toast. The companion simply _is_
  different the next time you glance over — and at most one Nami-line acknowledges it
  ("Something's different about her today."). Discovery of the change is the reward.
- Numbers, if surfaced at all, live in one place (a Settings/About-the-companion pane),
  phrased as prose in the house voice, never as a progress bar on the main UI.

---

## Part 4 — Anti-annoyance rules for a calm product

The genre's graveyard is full of pets that demanded attention. For shiranami these are
non-negotiable, extending the delight doc's F1 mitigations:

1. **It cannot die, cannot be sad about you, cannot be neglected.** Absence changes
   nothing; return is greeted warmly (Finch/Stardew, never Tamagotchi/Duolingo).
2. **No notifications, ever.** Already a house rule (`tauri-plugin-notification`
   deliberately absent). The companion is only ever seen because the user opened the app.
3. **A seat, not a stage.** In-app it occupies a reserved corner (Overview seat +
   optionally the compact player), never overlays content, `pointer-events-none` except
   one deliberate hit area. If an OS overlay ships later: no window-climbing, no
   cursor-chasing, no multiplication — the shimeji interference failure mode.
4. **Reacts to the music, not to the user.** Sways while playing (tempo-locked once the
   BPM rung lands — the breathing pattern already exists), dozes on pause, settles
   during wind-down, still during the sleep fade. Reaction is the moment-to-moment
   reward; XP is background.
5. **Speaks on Nami's cadence** — ≤1 line per launch, ≥4 h floor, random suppression,
   observations never prompts, never dismissible-with-an-X. One engine, one budget:
   companion lines and F1 lines share the same cap, they don't stack.
6. **Silent during Sanctuary and wind-down.** The companion may be _present_ (breathing
   with the tempo) but never speaks, levels, or animates busily there.
7. **Every layer is opt-out-able** via `useInterfaceStore` keys (seat visibility, lines,
   growth acknowledgements) and all motion routes through `useDecorativeMotion`.
8. **No quests, no goals, no daily anything.** The companion never suggests what to do.
   It grows from what you were going to do anyway.
9. **Progress is never comparative** — no sharing hooks, no "top X%", nothing that turns
   the relationship into a metric (Moment-card export of the companion is fine — it's an
   artefact, not a leaderboard).
10. **XP integrity over engagement** (Part 3.3) — when a mechanic would boost
    "engagement" by rewarding app-open time, it is wrong by definition here.

---

## Part 5 — Licensing notes

- **Referenceable / portable:** claude-buddy (MIT), vscode-pets (MIT), Shimeji-ee
  source (New BSD), original Shimeji (zlib/libpng). All compatible with the Shiranami
  Source Available License.
- **Verify before touching:** individual Shimeji forks (Linux ports, VShimeji, etc.)
  and eSheep reimplementations — licenses vary per fork; some are GPL. Read each
  LICENSE; when in doubt, treat as unusable and reimplement from behavior descriptions.
- **Observation-only:** Bongo Cat, Desktop Mate (proprietary) — mechanics are prior
  art, nothing is reusable.
- **Art:** community shimeji packs are personal-use-only — categorically unusable. All
  companion art must be original or commissioned (the existing mascot + ShiroAni chibi
  pipeline). Budget stages as single 256×256 poses first, 8-frame strips only where a
  stage earns it.
- **No third-party pet engine is worth adopting.** The needed engine is a positioned
  `<img>`/component, a pose map keyed by playback state + growth stage, and the F1 line
  engine — all in-house. Dependencies here would import license risk for negative value.

---

## Part 6 — Synthesis: the recommendation in one paragraph

Make the companion **Nami herself**, seated in the Overview corner (and optionally the
compact player), growing through 8–10 named stages driven by event-based XP — completed
listens, sessions, discovery firsts, curation acts, analysis milestones — capped daily
and weighted toward diversity so the only way to raise her is to genuinely listen to
music, which simultaneously feeds the recommendation engine better data. She reacts to
playback (sway / doze / settle), speaks on F1's cadence budget, levels silently, can
never be neglected, and every layer is opt-out. Ship the in-app seat first; an OS
overlay window (Tauri transparent always-on-top, replacing ShiroAni's win32-only C++
approach) is a later rung, with ShiroAni's `'tray-only'` mode as its best idea. Total
art floor: one pose per stage at 256×256, proven sufficient by both in-house apps.

---

## Sources

- [claude-buddy (Coding Buddy) — MCP-based companion for Claude Code](https://github.com/1270011/claude-buddy)
- [Kilkakon — Shimeji-ee Desktop Pet](https://kilkakon.com/shimeji/)
- [Shimeji-ee on SourceForge (New BSD; original zlib/libpng)](https://sourceforge.net/projects/shimeji-ee/)
- [VShimeji — fork of Kilkakon's Shimeji-ee](https://github.com/Valkryst/VShimeji)
- [OpenPets — 7 Best Shimeji Alternatives in 2026](https://openpets.dev/alternatives/shimeji)
- [OpenPets — 7 Best Bongo Cat Alternatives in 2026](https://openpets.dev/alternatives/bongo-cat)
- [PC Gamer — Bongo Cat, one of the biggest games on Steam](https://www.pcgamer.com/games/life-sim/one-of-the-biggest-games-on-steam-right-now-is-bongo-cat-a-cat-with-a-hat-who-smacks-your-windows-taskbar-like-a-bongo-drum-when-you-type/)
- [GameGrin — Bongo Cat Review](https://www.gamegrin.com/reviews/bongo-cat-review/)
- [TheGamer — The Best Desktop Pets On Steam](https://www.thegamer.com/steam-best-desktop-pets/)
- [vscode-pets — tonybaloney (MIT)](https://github.com/tonybaloney/vscode-pets)
- [VS Code Pets docs — pets & interactions](https://tonybaloney.github.io/vscode-pets/pets/)
- [UX Republic — Emotional design: what the Tamagotchi taught us](https://www.ux-republic.com/en/emotional-design-what-the-tamagotchi-taught-us-without-saying-it/)
- [American Pop — Pocket Mortality: How Tamagotchi Taught a Generation About Death, Care, and Digital Existence](https://americanpop.substack.com/p/pocket-mortality-how-tamagotchi-taught)
- [Yu-kai Chou — Streak Design: 4 Rules Behind Duolingo's Loop](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/)
- [Blake Crosley — Duolingo: Gamification as Design Language](https://blakecrosley.com/guides/design/duolingo)
- [Wikipedia — Forest (application), loss-aversion mechanic](<https://en.wikipedia.org/wiki/Forest_(application)>)
- [Techweez — Forest: the app that kills a tree](https://techweez.com/2026/07/24/forest-productivity-app-review/)
- [Stardew Valley Wiki — Friendship (decay stops at max hearts)](https://stardewvalleywiki.com/Friendship)
- [Davide Aversa — GameDesign Math: RPG Level-based Progression](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
- [Game Developer — Quantitative design: how to define XP thresholds](https://www.gamedeveloper.com/design/quantitative-design---how-to-define-xp-thresholds-)
- [StraySpark — RPG Stat Systems: Designing Progression That Feels Rewarding](https://www.strayspark.studio/blog/rpg-stat-systems-character-progression-design)
- [Deconstructor of Fun — How Finch Uses Gamified Widgets to Drive Retention](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl) _(carried over from the delight doc)_
