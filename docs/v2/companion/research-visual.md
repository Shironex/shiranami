# Shiranami v2 — Companion research: character, look & animation

**Lens:** the desk companion made real — who it is, what it looks like, how it moves, and
how a solo non-illustrator ships it. This doc owns _character concept, visual design and
animation behavior_. The leveling **system** (thresholds, persistence, history reads) and
any second-window/Tauri work are sibling lanes; this doc only defines what those lanes
must render.

**Date:** 2026-08-05 · **Target:** v2.1 (the feature-wave plan backlogs both "Nami's
notes" and "desk companion" to v2.1 — this is the design groundwork for that slot)

---

## Part 0 — Grounding: what already exists (and constrains this design)

| Fact                                                                    | Where                                                                                                                                               | Consequence for the companion                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nami — the chibi girl in headphones and the 白波 hoodie — is the mascot | `apps/web/public/mascot.png` (256×256 PNG), rendered in `apps/web/src/components/shared/ViewEmptyState/`, `SearchingCard`, onboarding `WelcomeStep` | She is loved, planned for ("Nami's notes", research-delight F1), and **static raster** — her purple is fixed and cannot follow the record. Don't replace her; don't try to rig her either.                                                                                                                      |
| Tempo-locked breathing shipped                                          | `apps/web/src/lib/tempoBreathing.ts`, `globals.css` `@utility float-mascot / bloom-breathe / pulse-beat`                                            | `--beat-duration`, `--breath-float` (4.5–9s), `--breath-pulse` (2–4s), `--breath-bloom` (3–6s) are published on `<html>` with fixed-period fallbacks. **The companion's sway costs zero new infrastructure — it is one CSS `var()`.** The octave-folding calm rule (never faster than the band) is already law. |
| Palette theming shipped                                                 | `apps/web/src/lib/artPalette.ts`, `useAmbientColor.tsx`                                                                                             | `--art-1…5` (dominant/vibrant/muted/dark/light) + `--art-ink` + `--primary-rgb` live on `<html>`, ease between records, and degrade on monochrome sleeves. **An SVG companion recolors itself for free; a PNG one never can.** This single fact decides the art pipeline.                                       |
| Motion gates                                                            | `apps/web/src/hooks/useDecorativeMotion.ts`                                                                                                         | Reduced-motion + low-perf → static frame, not absence. Non-negotiable, same as the splash rain.                                                                                                                                                                                                                 |
| Sanctuary Mode chrome                                                   | `apps/web/src/components/sanctuary/SanctuaryView/SanctuaryView.hooks.ts`                                                                            | Chrome swims away after 4 quiet seconds. The companion is chrome — it must ride the same `chromeVisible` fade.                                                                                                                                                                                                  |
| Wind down + weekly recap shipped                                        | plan.md Lane D; `useInterfaceStore.overviewRecap`                                                                                                   | Two ready-made ritual surfaces (the yawn, the recap cameo) with opt-out keys as precedent. The companion gets its own `companion` key in `useInterfaceStore` — the free opt-out is house law.                                                                                                                   |
| BPM + LUFS per track                                                    | Lane R (migration 0003 bpm/key; `packages/contracts/src/ipc/loudness.ts`)                                                                           | "High-energy track" is computable locally: BPM band + loudness. No new analysis needed for the dancing state.                                                                                                                                                                                                   |
| ShiroAni's mascot pipeline                                              | `/Users/shirone/Documents/Projects/shiroani/docs/mascot-prompts.md`, `docs/research/2026-06-12-mascot-shimeji-successor.md`                         | Proven solo-dev precedent: Recraft V3 pose generation + paper-doll whole-image transforms (rock/bob/squash) read as animation at 256px. Also proven: the pose-consistency battle is real, and raster sheets lock the palette.                                                                                   |
| License                                                                 | `LICENSE` (Shiranami Source Available)                                                                                                              | GPL-licensed shimeji packs and CC-BY-SA sprite rips are unusable. Assets must be authored in-house or commissioned with full rights.                                                                                                                                                                            |
| House voice                                                             | research-delight §1.3                                                                                                                               | Observations, never prompts. No badge, no counter, no guilt. Every companion string ships EN + hand-written PL.                                                                                                                                                                                                 |

---

## Part 1 — Who is the companion?

Three candidates were weighed. The decision hinges on three hard constraints: it must
**recolor with the record** (the app's whole visual thesis), it must be **animatable by a
solo dev who is not an illustrator**, and it must not orphan Nami.

### Option A — **Awa (泡)**, the sea-foam sprite · ★ recommended

A palm-sized wisp of white sea foam — a soft teardrop body with a single curling wave
crest for a cowlick, two dark sleepy eyes, and a base that dissolves into two or three
drifting bubbles. Born, in lore, from Nami's headphones: the hum made visible. In winter
Japan, sea foam blown ashore is called 波の花 — _flowers of the waves_ — which is the
leveling metaphor for free: listening makes the foam bloom.

- **On-brand to the letter.** Shiranami _is_ the white wave. The companion is literally a
  small shiranami; the app icon, the splash rain, and the pet all rhyme.
- **The silhouette is a solo-dev silhouette.** A blob with a crest is 6–8 SVG paths.
  Squash-and-stretch on a blob reads as charm; on an anime girl it reads as a glitch.
- **It recolors.** Foam stays white (the brand), everything else — inner glow, cheek
  light, ripple, bubbles, later accessories — rides `--art-*` / `--primary-rgb`. The
  companion visibly _wears the record_.
- **It protects Nami.** She stays the poster girl (empty states, onboarding, landing) and
  becomes Awa's origin. "Nami's notes" (v2.1) can even be delivered _by_ Awa without
  redesigning either.

Name: **Awa** (泡, "foam/bubble" — two syllables, cute in EN and PL). Alternates if it
doesn't sing: **Saza** (from さざ波, ripple) or **Shibu** (飛沫, sea spray).

### Option B — Nami herself, promoted to a rigged pet

Recraft pose pack (idle/sway/sleep/dance…) + ShiroAni-style paper-doll transforms.
Rejected as the _pet_: her fixed purple fights palette theming everywhere; every leveling
stage would multiply a pose pack that is already hard to keep consistent (ShiroAni's own
notes say "cherry-pick aggressively"); and 256px raster on a 4K monitor is a smudge.
She keeps her current seats unchanged.

### Option C — a tide-cat ("Mizu"), crescent-curled, tail swishing on the beat

Cats sell, but the lofi-girl-with-cat is the most saturated cliché in the genre, and it
carries no shiranami meaning. Bongo Cat adjacency invites the wrong comparison. Rejected.

### One companion or a cast?

**One.** A collectible cast is a gacha shelf — it imports acquisition pressure into a
sanctuary and multiplies art n-fold. Finch's lesson (research-delight Part 2) is that
depth of one relationship beats breadth: one Awa that slowly becomes _yours_ — grown by
your hours, tinted by your records. Variety comes from the palette (Awa looks different
on every album) and from stages, not from a roster.

---

## Part 2 — Look

### Silhouette & construction

Rounded teardrop, slightly wider than tall (~1.1:1). One wave-crest curl on top —
a restrained nod to the Hokusai claw, not a literal quote. Two oval eyes (no whites),
usually half-lidded and content; a mouth only when yawning or mid-hum. The bottom edge
is not a hard line: it breaks into 2–3 foam bubbles that drift and re-merge. Beneath it,
a thin elliptical **ripple pool** — its shadow and its stage indicator in one.

SVG layer stack (one file, semantic groups):

| Layer (`<g id>`)            | Fill                                                                                        | Notes                                               |
| --------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `pool` (ripple ellipse)     | `var(--art-4)` at ~25%                                                                      | dark swatch — reads as water in any theme           |
| `bubbles` (2–3 circles)     | `var(--art-3)` at ~50%                                                                      | muted swatch; pop/rise in several states            |
| `body` (foam)               | near-white `oklch(0.96 0.01 260)` + a soft inner radial of `rgb(var(--primary-rgb) / 0.18)` | white is the brand constant; the tint is the record |
| `crest` (curl)              | body white, inner face `var(--art-2)` at ~35%                                               | vibrant swatch — the "voice" of the cover           |
| `face` (eyes, blush, mouth) | `var(--art-ink)`-derived dark; blush `rgb(var(--primary-rgb) / 0.3)`                        | ink token keeps contrast on light themes            |
| `gear` (stage accessories)  | mixed, accents on `--primary-rgb`                                                           | empty until stage 3 (Part 4)                        |

Monochrome sleeves already null the accent (`artAccentHex` returns null) — Awa quietly
returns to pure white-on-theme, which is itself correct: a black-and-white record gets a
black-and-white companion.

### Size

- **Player perch: 56px** (h-14) — smaller than the 72px empty-state Nami on purpose;
  a resident should be quieter than a greeter.
- **Now Playing: 64px**, Sanctuary cameo: 72px at reduced opacity.
- Compact player (500×214): **40px** or absent — measure crowding in situ before committing.

### Where it lives

**Primary perch: sitting on the top edge of the PlayerBar, right-hand side** — feet
(bubbles) overlapping the bar's border so it reads as _sitting on_ the bar, not floating
near it. The metaphor writes itself: the waveform seekbar is the water; Awa sits on the
shoreline. Placement details:

- **Draggable along the bar's top edge only** (x-constrained, position persisted in the
  companion store). Free-roaming desktop travel is explicitly the v2.1 Desk Companion /
  second-window project (research-visual #9) — this perch is its in-app seed, and the
  same rig ports there later.
- **Not on the seekbar itself.** Riding the playhead was considered and rejected: it
  turns a precision control into a hitbox conflict and puts constant motion next to the
  one surface users stare at.
- **Now Playing view:** relocates to the lower-right corner of the album art, half
  overlapping the frame edge.
- **Lyric Focus:** hides (Part 3, state 10). Text is the event.
- **Sanctuary Mode:** present but treated as chrome — fades with `chromeVisible` after
  the 4-second stillness. One sub-toggle ("companion keeps watch in Sanctuary") lets it
  stay at 40% opacity, asleep-swaying in a bottom corner, for people who want the
  screensaver inhabited.
- **Overview:** not present, except the weekly-recap cameo (state 11).
- `useInterfaceStore.companion: boolean` (default **true**) is the single opt-out,
  same contract as every Overview widget.

---

## Part 3 — Behavior: the full state machine

One reducer, one active state, one-shot overlays (blink, ripple) allowed on top of loops.
All transitions ≤400ms ease-out. Everything routes through `useDecorativeMotion`; under
reduced-motion/low-perf every state renders its first frame statically (splash-rain
rule). The state logic lives in a pure `companionMachine.ts` so the cadence — not the
animation — is what gets unit tests (research-delight §Part 5.9).

| #   | State                             | Trigger                                                                                               | What moves                                                                                                                                                                                                                                                  | Duration / loop                                                 |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **idle**                          | app open, nothing playing                                                                             | Slow float (`float-mascot`'s 6s fallback), blink every 4–8s, occasional 1s glance toward the library                                                                                                                                                        | loop                                                            |
| 2   | **listening**                     | playback playing                                                                                      | The heart of the feature: body sways ±4° at `var(--breath-float)` (bar-folded 4.5–9s), crest bobs counter-phase at `var(--breath-pulse)`, eyes half-close. The pet breathes _with the room_ — same vars as the bloom                                        | loop while playing                                              |
| 3   | **grooving**                      | playing ∧ track BPM ≥ ~110 (post-fold) ∧ loudness above library median                                | Sway amplitude ~doubles (±8°), a small two-frame hop every second `--breath-pulse` period, one bubble pops off per hop. Still octave-folded — it can never strobe                                                                                           | loop while the track qualifies                                  |
| 4   | **humming** (instrument flourish) | ≥15 min continuous listening, ≤1 per 15 min, random suppression roll (MascotIdleNote cadence pattern) | Stage-dependent instrument materializes (Part 4); 2–3 note glyphs drift up and fade (reuse `MascotIdleNote` verbatim); eyes closed                                                                                                                          | 6–10s one-shot → listening                                      |
| 5   | **drowsy → sleeping**             | pause / stop                                                                                          | 1.5s settle: body sinks 15%, eyes droop, crest wilts → sleep loop: flattened mound, breathing at fixed 8s (no track, no beat var), one tiny bubble rises every 8–12s at 30% opacity in place of a "zzz"                                                     | loop until resume                                               |
| 6   | **waking**                        | play after sleep                                                                                      | Bubble pops, squash-stretch 0.9→1.06→1.0, one blink, crest springs up                                                                                                                                                                                       | 0.8s one-shot → listening                                       |
| 7   | **track-change ripple**           | track change                                                                                          | Turns toward the artwork; inner tint cross-fades to the new `--art-*` over the same duration as the bloom crossfade; one ripple ring expands through `pool` and fades                                                                                       | ~1.2s; **cancel, never queue** on rapid skips (Continuity rule) |
| 8   | **level-up** ("the tide rises")   | stage threshold crossed — deferred to the next track boundary, never mid-song                         | The only celebration: pool swells once, 4–6 foam bubbles rise and burst softly, the new stage layer shimmers in (opacity + 1.03 scale), settles. No confetti, no sound, no modal. Afterward one house-voice line may appear once: "Awa has grown a little." | ~3s one-shot, at most once per session                          |
| 9   | **wind-down yawn**                | Wind down enters its final 10 min                                                                     | One yawn (mouth appears, crest droops, eyes squeeze), then Awa dims _with_ the UI ramp and curls toward sleep so that when the fade completes it is already asleep — it goes to bed with you. Grooving/humming suppressed for the ritual                    | tracks the wind-down ramp                                       |
| 10  | **hiding** (Lyric Focus)          | lyric presentation = focus                                                                            | Slides down behind the player-bar edge, 300ms ease-in; returns on exit                                                                                                                                                                                      | until exit                                                      |
| 11  | **recap cameo**                   | weekly recap card renders (`overviewRecap`)                                                           | Static pose sitting on the card's top corner — content after a listening week, asleep on a quiet one ("Quiet week. That's fine too." made visual, and it must ship for the quiet case or the silence is the judgement)                                      | static, no loop                                                 |
| 12  | **peek**                          | pointer hovers the perch                                                                              | Eyes track the cursor (±2px pupil offset), body leans 2° toward it. Click: one happy bounce + one note glyph — no menu, no reward, nothing to farm. Drag: squish + wide eyes; release: 3-wobble settle                                                      | while hovered                                                   |
| 13  | **hidden**                        | `companion: false`                                                                                    | unmounted                                                                                                                                                                                                                                                   | —                                                               |

Priority: 13 > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2 > 1, with 12 as an overlay on any
visible loop. Accessibility contract (Storybook play-test, `CompletionFlourish` pattern):
`aria-hidden`, `pointer-events` only on the sprite body, nothing reaches the a11y tree.

---

## Part 4 — Leveling: the tide, not the score

**Currency:** cumulative listening hours from `play_history` — data that already exists
(`db:history:get-summary` with open window). No new writes; one memoized read at launch
plus a light periodic refresh. **Stages never regress, nothing decays, absence costs
nothing** (Finch rule).

**Five stages**, spaced so growth is an occasional surprise, not a treadmill:

| Stage | Name                             | ~Threshold | What visibly changes (additive SVG layers)                                                                                                                                      |
| ----- | -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Shizuku** (雫, droplet)        | 0h         | The bare droplet — no crest, big eyes, one bubble. Endearingly unfinished.                                                                                                      |
| 2     | **Sazanami** (さざ波, ripple)    | 25h        | The crest curl sprouts; the ripple pool appears; second bubble.                                                                                                                 |
| 3     | **Konami** (小波, small wave)    | 100h       | Crest fully curls; cheek-blush tint activates; **kalimba** unlocks for the humming state.                                                                                       |
| 4     | **Shiranami** (白波, whitecap)   | 300h       | Foam flecks orbit slowly; **tiny headphones** — the family-resemblance moment with Nami, the single most screenshotable beat in the design; **ukulele**.                        |
| 5     | **Ōnami** (大波, the great wave) | 700h       | A faint crescent-moon halo; sleeps curled inside the crescent; in Sanctuary its sway leaves a 1-frame light trail. Terminal stage — after this, the relationship is the reward. |

Size barely changes (+10% total by stage 5) — growth is _articulation_, not mass, so the
perch never crowds the player bar.

**How progress shows without HUD clutter — the companion is the progress bar:**

- **No XP bar, no numbers, no percent, anywhere near the player.** The form itself is
  the display; a returning user notices the crest has curled the way you notice a plant
  has grown.
- A "fill the pool toward next level" ambient meter was considered and **rejected** — it
  is an XP bar wearing a costume, and it converts presence into pending.
- The only place numbers exist: **Settings → Interface → Companion**, as prose —
  "Awa · small wave · grown from 112 hours of listening." Sought, never shown.
- The weekly recap may carry one line in the week a stage changed ("Awa grew this
  week."). Observation, never prompt.
- Level-up itself defers to a track boundary (state 8) and needs no acknowledgement,
  tap-through, or reward claim.

---

## Part 5 — Art pipeline for a solo non-illustrator

The deciding constraint is **recolorability via CSS custom properties** — palette
theming is the app's visual thesis, and a companion that can't follow the record is a
sticker, not a resident. Second constraint: the Source Available license makes GPL
sprite packs (most classic shimeji sets) unusable — assets must be authored or
commissioned with full rights.

| Pipeline                                               | File size                                                   | CSS-var recolor                                                                                                                  | Animation quality                                                                                                                                   | Licensing                                                                     | Solo effort                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Sprite sheets (Recraft/commission, ShiroAni-style) | ~50–200 KB PNG per stage-set; ×5 stages ×13 states explodes | **None** — raster bakes the palette; the deal-breaker                                                                            | Charming at 8 frames; consistency battles across poses (ShiroAni's own notes)                                                                       | Recraft terms OK on paid plan; commissions need explicit full-rights contract | High and _recurring_ — every stage multiplies every pose                                                                                                        |
| **(b) Layered SVG + CSS/WAAPI ★**                      | **~10–15 KB, one file, zero deps**                          | **Native** — `fill: var(--art-2)`, `rgb(var(--primary-rgb)/α)` just work, including the eased palette tween the app already does | Squash/stretch/rotation on grouped layers; secondary motion limited — which is why the character is a blob, not a girl                              | Authored in-house — clean                                                     | Medium once; stages are additive layers in the same rig                                                                                                         |
| (c) Lottie                                             | 60 KB+ runtime dep + JSON per animation                     | Awkward — runtime property mutation, brittle against theme swaps                                                                 | High, but authored in After Effects (cost + skill)                                                                                                  | Player MIT; AE assets fine                                                    | High — wrong tool without an AE background                                                                                                                      |
| (d) Rive                                               | Small .riv, but ~a few hundred KB WASM runtime              | Indirect only — JS bridge from `--art-*` into Rive inputs; fights `usePrimaryRGB`'s free propagation                             | Best-in-class state-machine rigging                                                                                                                 | Editor free tier OK; runtime MIT                                              | Medium-high learning curve + a proprietary editor between you and your own mascot; also the repo's first WASM/GL renderer — against the "no shader code" stance |
| (e) Procedural canvas                                  | 0 assets                                                    | Full (already proven by 12 visualizers)                                                                                          | Motion great, _character_ miserable — faces and poses in imperative code iterate terribly; always-on RAF beats CSS compositor animations on battery | Clean                                                                         | High per expression                                                                                                                                             |

### Recommendation: **(b) layered SVG + CSS keyframes for loops, WAAPI for one-shots**

It is the only option where the shipped infrastructure does most of the work: the loops
ride the exact `--breath-*` variables and `@utility` pattern in `globals.css`, recolor
falls out of `useAmbientColor` publishing `--art-*`, Storybook a11y play-tests work on
real DOM, and the whole character weighs less than one frame of a sprite sheet.

**Concrete workflow:**

1. **Design the rig in Figma** (already in the toolchain): one artboard, the stage-5
   silhouette with every layer present — pool, bubbles, body, crest, face variants
   (eyes open / half / closed / wink; mouth none / hum / yawn), and each stage's gear.
   Use Recraft V3 vector-style generations ("Vector Illustration → Line Art", per the
   ShiroAni prompt guide) as _reference sketches to trace_, not as shipped assets —
   tracing guarantees clean paths and unencumbered ownership.
2. **Export one SVG, clean it into `<Companion />`** — semantic `<g id>` groups, fills
   replaced with the `var()` tokens from Part 2's table, `viewBox="0 0 64 64"`.
   Component folder per house convention: `apps/web/src/components/companion/Companion/`
   (6 files, lint-enforced).
3. **Loops as CSS keyframes** on the groups (`transform`/`opacity` only — compositor
   friendly): `companion-sway` at `var(--breath-float, 6s)`, `companion-crest-bob` at
   `var(--breath-pulse, 3s)`, `companion-sleep-breathe` at fixed 8s. New `@utility`
   entries beside `float-mascot`.
4. **One-shots via WAAPI** (`element.animate()`) for wake, ripple, level-up, yawn —
   because WAAPI animations can be **cancelled** cleanly on rapid skips, the lesson the
   visual-crossfade work already encoded.
5. **State logic as a pure reducer** (`companionMachine.ts` + `useCompanion` hook):
   inputs are playback state, BPM/loudness, wind-down phase, lyric mode, hover; outputs
   are `{state, stage, overlays}`. Unit-test the reducer and the flourish cadence;
   never test pixels.
6. **Stages as layer visibility** — `data-stage={n}` on the root, CSS reveals the
   additive groups. One file forever; a new stage is new paths, not a new asset set.
7. **Nami stays a PNG** exactly where she is. If the family resemblance should ever
   tighten, a future pass can redraw _her_ as SVG too — out of scope here.

Escape hatch if the blob reads too flat after a week of living with it: keep the rig and
commission a single professional **design pass on the static shapes** (an illustrator
refining paths in the existing SVG structure is cheap; commissioning animation is not).

---

## Part 6 — Watch out for

- **Cuteness inflation.** The failure mode is a Tamagotchi in a sanctuary. Awa never
  emotes need: no hunger, no sadness when you're away, no big eyes begging for clicks.
  Its default expression is contentment. (Finch: the pet never guilts.)
- **The perch must never fight the controls.** Hitbox strictly the sprite body; the
  drag-strip is the bar's top 8px only; and the volume/queue cluster keeps right-of-way —
  Awa's default x sits left of them.
- **Palette flicker on rapid skips** — the tint tween must reuse the crossfade
  cancel-not-queue discipline or five fast skips produce a rainbow shimmer.
- **Compact mode is 500×214** — a 40px pet may be one element too many; prototype and be
  willing to cut it there entirely.
- **PL copy.** Awa's few strings (Settings prose, level-up line, recap line) are
  re-authored in Polish, not translated — same rule as Nami's notes.
- **Don't pre-build the second window.** The perch rig is deliberately portable (pure
  SVG + reducer), so the v2.1 Desk Companion window can adopt it — but no Tauri work
  belongs in this feature.

---

## Part 7 — Release note, as it would ship

> **Awa moved in.** A small sea-foam sprite now sits on the edge of your player, swaying
> at the tempo of whatever's on, tinted by the record's own colors. Pause, and it dozes
> off. Keep listening, week after week, and it slowly grows — from a droplet into a
> little white wave. It never asks for anything. It's just glad you're here.
