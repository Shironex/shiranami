# Shiranami v2 — feature ideation through the "what the Rust engine makes newly possible or cheap" lens

Research date: 2026-08-03. Read-only pass over `crates/`, `docs/v2/architecture.md`,
`apps/desktop-tauri/src-tauri/src/commands/`, `apps/web/src/hooks|components`, plus crate/licence
research on crates.io and the vendored sources in `~/.cargo/registry`.

---

## 0. Grounding: what the port actually left on the table

Everything below is verified in-tree, not assumed.

### 0.1 The audio crate is a decoder plus two consumers, with a documented third socket

`/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/lib.rs:40-46`

> `# Rung 3` — "BPM is deliberately absent rather than stubbed. The seam it lands on is
> [`sink::PcmSink`]: a `bpm` module adds an onset-detector sink and a `bpm_from_file`, reusing the
> decoder and the error taxonomy unchanged."

`/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/sink.rs:8-11`

> "Decoding a track is by far the expensive half of any analysis — the C++ addon paid it twice …
> a caller that wants two measurements from one decode implements a sink that forwards to both."

**The fan-out sink is designed for and does not exist.** Nothing in the tree implements a
multi-consumer `PcmSink`. `peaks_from_file` and `measure_integrated_loudness` each open their own
`decode_file`.

### 0.2 The analysis batch is still v1-shaped: sequential, single-threaded, one decode per measurement

`/Users/shirone/Documents/Projects/shiranami/apps/desktop-tauri/src-tauri/src/commands/loudness.rs:258-260`

> "Sequential, one track at a time, as v1 was: the decode is already CPU-saturating and the unit of
> parallelism this crate's docs name is a track."

That was the correct port decision (fidelity), but it is now the single largest unclaimed win: the
process already links `rayon` (`Cargo.toml:250`) and the scan already runs a private 16-thread pool
(`crates/shiranami-library/src/scan/parse.rs:45`). The loudness batch runs one core.

Waveform peaks are worse: `apps/desktop-tauri/src-tauri/src/commands/waveform.rs` is **on-demand,
per-track, at play time** (disk-cached in `waveform-peaks/`). A first play of an unanalysed track
pays a full decode.

### 0.3 The user's C++ rung 3 exists, works, and is stranded on an unmerged branch

`git branch -a` shows `feat/native-bpm-key-addon` (also on `origin`). Its 7 commits contain a
complete, tested DSP core:

| file (on that branch)                                                   | what it is                                                                                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/native/core/fft.cpp` (92 L)                           | radix-2 FFT + `magnitudeSpectrum`                                                                                                               |
| `apps/desktop/src/native/core/tempo.cpp` (121 L)                        | energy envelope @100 Hz → half-wave-rectified flux → autocorrelation over a 60–180 BPM lag band → parabolic peak interpolation → octave folding |
| `apps/desktop/src/native/core/key.cpp` (144 L)                          | 4096/2048 chromagram, bin→pitch-class via MIDI, Krumhansl–Schmuckler major/minor profiles, Pearson correlation over 24 rotations                |
| `apps/desktop/src/native/test/test_{fft,tempo,key}.cpp`                 | unit tests against synthesised audio                                                                                                            |
| `packages/database/…/20260101000008_track_bpm_key/migration.sql`        | `bpm` + `musical_key` columns                                                                                                                   |
| `apps/web/src/hooks/useBpmKeyAnalysis.ts`, NowPlaying + Settings wiring | the whole UI                                                                                                                                    |

The architecture doc records the collision this caused
(`docs/v2/architecture.md:2130-2135`): the developer's own v1 profile carries that migration, and
v2 adoption refuses it as `UnknownV1Migration`. **The branch is currently a liability; porting it to
Rust converts it into a shipped feature and closes the refusal.**

`docs/v2/architecture.md:59` — "Non-goals for v2.0: native Rust playback, output-device selection,
true gapless, BPM detection (post-v2), OS-keychain secrets (post-v2), Linux packaging."
v2.0 is now shipped-and-held; "post-v2" is exactly this release.

### 0.4 The architecture doc names its own highest-value gap

`docs/v2/architecture.md:1057-1068`

> "**There is no new/changed/moved detection to port.** File identity is the absolute path string —
> no mtime, no size, no content hash… a moved or renamed file is an insert at the new path plus a
> hard delete at the old, which resets `play_count`, `is_favorite` and `loudness_lufs`, mints a new
> `id`, resets `created_at`, and cascades away every playlist entry and history row keyed on the old
> id. … **Identity-preserving move detection is a real feature needing a stable key the schema does
> not store; it is the highest-value thing this subsystem lacks** and is left for a product
> decision, not smuggled in as a port."

And `docs/v2/architecture.md:1070-1075`: "`notify` is not used and is not pinned… adding one would
be a new feature wearing a port's clothes." Both are explicit invitations for v2.x.

### 0.5 Loudness is track-only; the primitives for album mode are already linked

`crates/shiranami-audio/src/loudness.rs:109` constructs `EbuR128::new(ch, rate, Mode::I)` — integrated
only. The pinned `ebur128 = "0.1.10"` (`Cargo.toml:136`) already exposes, verified in
`~/.cargo/registry/src/…/ebur128-0.1.10/src/ebur128.rs`:

- `Mode::TRUE_PEAK` (line 70) and `Mode::LRA` (line 67)
- `EbuR128::loudness_global_multiple` (line 781) — "call over all the chunks to get the global
  loudness", i.e. **album gain is a fold over per-track states with zero new dependencies**

The renderer's normaliser is `apps/web/src/lib/loudness.ts` → `computeLoudnessGainDb` = clamp(target −
measured, ±`LOUDNESS_MAX_GAIN_DB`). No album mode, no true-peak guard, so a quiet master can be
boosted into clipping.

### 0.6 symphonia already parses encoder delay/padding — the gapless metadata is free

`~/.cargo/registry/src/…/symphonia-core-0.6.0/src/formats/mod.rs:270,273` —
`Track { delay: Option<u32>, padding: Option<u32> }` (frames).
`~/.cargo/registry/src/…/symphonia-bundle-mp3-0.6.0/src/demuxer.rs:426-428` — "The LAME tag contains
ReplayGain and padding information" → `with_delay(lame_tag.enc_delay).with_padding(lame_tag.enc_padding)`.
`symphonia-core/src/codecs/audio.rs:211-236` — `AudioDecoderOptions { gapless: bool }`, default `true`.

Nothing in `shiranami-audio` reads any of it. The renderer's decks
(`apps/web/src/hooks/useAudioEngine.ts`, 1,068 L; `preBufferRef` at :157) do a fixed-duration
equal-power crossfade and a "near-gapless pre-buffer" (:153-159) with **no knowledge of where the
music actually starts and ends inside the file**.

### 0.7 FTS5 is already inside the shipped binary — verified, not assumed

`Cargo.toml:144` enables sqlx's `sqlite` feature. Chain:
`sqlx-0.9.0/Cargo.toml:181` `sqlite = ["sqlite-bundled", …]` → `:187` `sqlx-sqlite/bundled` →
`sqlx-sqlite-0.9.0/Cargo.toml:59` `libsqlite3-sys/bundled` →
`libsqlite3-sys-0.37.0/build.rs:132` `.flag("-DSQLITE_ENABLE_FTS5")`.

Empirical confirmation against the built artifact:

```
$ strings -a target/release/shiranami-desktop | grep -c ENABLE_FTS5
1
$ strings -a target/release/shiranami-desktop | grep -m5 'fts5'
fts5
fts5_source_id
fts5_locale
fts5_insttoken
reserved fts5 table name: %s
```

Meanwhile library search is a JS substring scan over the whole in-memory library:
`apps/web/src/components/library/LibraryView/LibraryView.hooks.ts:34-43`

```ts
const filteredLibrary = useMemo(() => {
  if (!searchQuery.trim()) return library;
  const q = searchQuery.toLowerCase();
  return library.filter(track =>
    track.title.toLowerCase().includes(q) ||
    track.artist.toLowerCase().includes(q) ||
    track.album.toLowerCase().includes(q) …
```

…fed by `crates/shiranami-db/src/repo/tracks.rs:48` `get_all` (the whole table into the renderer).

### 0.8 Schema headroom

`crates/shiranami-db/migrations/0001_baseline.sql:39-57` — `tracks` carries `id, file_path (UNIQUE),
title, artist, album, duration, genre, year, track_number, disc_number, album_art, is_favorite,
play_count, created_at, updated_at, album_artist, loudness_lufs`. **No bpm, no key, no fingerprint,
no true peak, no album gain, no lead-in/tail.** Migration `0002_scrobble_queue.sql` established that
v2 can add its own post-baseline migrations.

`play_history` (`:95-104`) has `played_at, played_seconds, completion_ratio, completed, source` with
indexes on both `track_id` and `played_at` — everything a deep stats feature needs.

### 0.9 Licence constraint — this is a trap worth flagging loudly

`/Users/shirone/Documents/Projects/shiranami/LICENSE` is the **Shiranami Source Available License**
("All rights reserved", not OSS). crates.io metadata pulled live:

| crate                   | latest                       | licence                                      | verdict                                                         |
| ----------------------- | ---------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `bliss-audio`           | 0.11.4 (2026-06-17)          | **GPL-3.0-only**                             | ❌ unusable                                                     |
| `aubio-rs`              | 0.2.0 (2021-04-30, dead)     | **GPL-3.0** + C lib                          | ❌ unusable, and reintroduces the C toolchain §2.9 just deleted |
| `realfft`               | 3.5.0 (2025-06-12), 14.2M dl | MIT                                          | ✅                                                              |
| `rustfft`               | 6.4.1 (2025-09-18), 23.7M dl | MIT OR Apache-2.0                            | ✅ (realfft wraps it)                                           |
| `rusty-chromaprint`     | 0.3.0 (2024-10-26), 168k dl  | **MIT**, pure Rust, ships symphonia examples | ✅                                                              |
| `rubato`                | 4.0.0 (2026-07-09)           | MIT OR Apache-2.0                            | ✅ if resampling is ever needed                                 |
| `notify`                | 8.2.0 stable (9.0.0-rc.4)    | CC0-1.0                                      | ✅                                                              |
| `notify-debouncer-full` | 0.7.0 stable                 | MIT OR Apache-2.0                            | ✅                                                              |
| `nucleo`                | 0.5.0                        | **MPL-2.0**                                  | ⚠️ file-level copyleft; FTS5 avoids the question entirely       |

**Consequence: the obvious "just use bliss-audio for sonic similarity" shortcut is closed.** Every
DSP feature below must be hand-rolled on `realfft` — which is precisely the C++→Rust ladder the user
wanted anyway. Frame this as a feature, not a tax.

---

## 1. The ten features

Effort key: **S** ≈ a few days, **M** ≈ 1–2 weeks, **L** ≈ 3+ weeks.
Wow-per-effort is 1–5, blending user-visible delight against implementation cost **and**
"could v1 have done this?" — a feature Electron could have shipped scores lower here even if users
like it.

---

### F1 — The parallel one-pass analysis engine ("Analyze library")

**What it is.** One button that walks the library and, **per track, decodes exactly once** while a
fan-out sink feeds every analyser at the same time — waveform peaks, integrated LUFS, true peak,
loudness range, BPM/key (F2), fingerprint (F3), gapless offsets (F4), quality flags (F8) — with
`rayon` running N tracks across all cores, live progress, and cancellation. Waveforms stop being a
lazy per-play decode: every seekbar in the library is instant afterwards.

**Rust angle.**

- `shiranami-audio` gains `analysis/` — a `FanOutSink` implementing `PcmSink` over a `Vec<Box<dyn
PcmSink>>`, plus an `AnalyzeRequest`/`TrackAnalysis` result struct. This is literally the design
  `src/sink.rs:8-11` documents and nobody built.
- The command layer replaces the sequential loop in `commands/loudness.rs:274-330` with a scoped
  `rayon::ThreadPool` (its own pool, not the global one — same reasoning as
  `crates/shiranami-library/src/scan/parse.rs`, which explains why the scan owns a private 16-thread
  pool so it "must not starve any other rayon user").
- Results batch back to SQLite in chunks, because the pool holds **a single connection**
  (`commands/loudness.rs:17-22`: "acquire late, release early"). Per-track write-through would
  serialise the whole thing on the pool.

**User payoff.** "Analyzing 4,812 tracks" finishes in minutes instead of tens of minutes, on a
laptop that stays responsive, and one pass produces every derived value the rest of the release
depends on. Instant waveforms everywhere.

**Effort:** M. **Wow-per-effort:** 5.

**Risks.**

- Thermals/battery: needs a "use N cores" setting and an on-battery default of ≤ half the cores.
- The single-connection pool is the real bottleneck — batch writes (e.g. 64 tracks/transaction) or
  the DB becomes the serialiser.
- Cancellation must stay per-checkpoint and still return partial counts; that contract is already
  documented (`commands/loudness.rs:24-29`) and users will notice if it regresses.
- Peaks cache keys are `sha256(path|mtime|size)` and are **compatibility-frozen** by
  `docs/v2/architecture.md` §3.3 — the batch must write through `peaks::cache` and not invent a key.
- Memory: an unbounded rayon queue holding decoded buffers for 16 tracks is fine; holding whole
  tracks is not. Keep sinks streaming (the peaks accumulator already is).

---

### F2 — Tempo & key detection in Rust (the ladder's third rung)

**What it is.** Every track gets an estimated BPM and musical key with a confidence score, shown in
Now Playing and the track detail, filterable in smart playlists, and usable as a mix axis
("Late-night, 70–85 BPM", "keep it in A minor").

**Rust angle.**

- `shiranami-audio/src/bpm.rs` + `key.rs`, both `PcmSink` implementations on the seam
  `lib.rs:40-46` reserves, riding F1's single decode. New dep: `realfft = "3.5"` (MIT) — the one
  Appendix-B addition, and the one §2.9 already predicted ("`realfft` for BPM post-v2").
- **The algorithm is already specified and unit-tested, in C++, on `feat/native-bpm-key-addon`.**
  `core/tempo.cpp` and `core/key.cpp` are a line-by-line porting brief (energy flux →
  autocorrelation → parabolic interpolation → octave fold; 4096/2048 chromagram → K-S profiles →
  Pearson over 24 rotations). `test_tempo.cpp` / `test_key.cpp` port to Rust as parity tests against
  synthesised audio — the exact shape `crates/shiranami-audio/tests/addon_parity.rs` already uses
  for LUFS.
- `shiranami-db` migration `0003_track_bpm_key.sql`: `bpm real`, `musical_key text`,
  `key_confidence real`. **Name it differently from the stranded v1 migration** — see risks.
- `shiranami-recommendation/src/core/mixes.rs` gains tempo as a mix axis alongside genre/year
  (`MixTrack` at :26-38 is the struct to extend).

**User payoff.** The headline "the new engine hears your music" feature, and the one that closes the
user's own three-rung learning ladder (peaks → LUFS → BPM) in the language the port chose. For a
lofi library specifically, tempo-banded mixes are genuinely useful: "study 70–80", "sleep <70".

**Effort:** M. **Wow-per-effort:** 4 (5 counting the personal arc).

**Risks.**

- **Accuracy on lofi is the hard part.** The C++ tempo detector is a plain energy-flux
  autocorrelator; lofi has soft, filtered transients and swung/laid-back drums. Expect octave
  errors (69 vs 138) and dead-flat ambient tracks scoring nothing. Mitigations: keep the octave fold
  but expose confidence, show "≈ 82 BPM" not "82.0", allow manual override, and store `NULL` rather
  than a bad guess when the autocorrelation peak is weak.
- Key detection on sparse/atonal material is worse than tempo. Krumhansl–Schmuckler on a raw
  magnitude chromagram has no harmonic-partial suppression; expect relative-major/minor confusions.
  Ship it as "estimated key" with confidence and consider hiding below a threshold.
- **The migration-name collision is live.** `docs/v2/architecture.md:2130-2135`: the developer's own
  v1 profile has `20260101000008_track_bpm_key` applied and v2 adoption **refuses** it
  (`UnknownV1Migration`, refusal #10). A v2 migration with a colliding intent must not confuse the
  adoption ledger. Decide explicitly: either teach adoption to recognise that v1 migration as a
  known-and-superseded one, or keep the v2 column names distinct. This must be settled before
  writing SQL.
- Chroma needs a window function (Hann) the C++ omits — porting verbatim reproduces spectral leakage.
  Worth deviating and documenting the deviation.

---

### F3 — Content fingerprints: identity that survives a move, and a real duplicate finder

**What it is.** Two features from one primitive. (a) **Move/rename detection** — reorganising your
music folder no longer wipes play counts, favourites, LUFS, playlists and history; the row follows
the file. (b) **"Find duplicates"** — a screen that finds the same recording twice even across
formats/bitrates/tags (the yt-dlp re-download of something you already own), with a
keep-the-better-copy picker (bitrate, format, has-art, higher LUFS confidence).

**Rust angle.**

- `shiranami-audio/src/fingerprint.rs`, two tiers:
  - **exact:** a hash of the _decoded audio_ or of the audio data range (skipping tag blocks), so a
    retagged file is still the same file. `sha2` is already pinned (`Cargo.toml:155`); `blake3` would
    be faster if a new pin is acceptable.
  - **acoustic:** `rusty-chromaprint = "0.3"` (MIT, pure Rust, 168k downloads, ships symphonia-based
    examples and a `compare` tool returning matching segments). Fingerprint the first ~120 s only.
- Both ride F1's single decode as extra `PcmSink`s.
- `shiranami-db`: `tracks.content_hash text`, `tracks.acoustid_fp blob`, index on `content_hash`.
- `shiranami-library` grows a real reconcile step. **Watch out:** today reconciliation lives in the
  _renderer_ (`docs/v2/architecture.md:1040-1053` — `apps/web/src/lib/scanHelpers.ts` +
  `useLibraryRescan.ts`, three round-trips, and the scan crate deliberately holds no DB). Move
  detection needs a new command that owns the diff, or the renderer needs the fingerprint in its
  `exists-many` answer. That is the design decision, and it is not small.

**User payoff.** The doc's own words: "the highest-value thing this subsystem lacks." Losing seven
years of play counts because you renamed a folder is the kind of bug that makes people distrust a
library manager. And duplicate detection is a top-3 ask for every local-library player — MusicBee's
own Find Duplicates is _tag-based_ and users complain it misses real duplicates; acoustic
fingerprinting is what the paid third-party tools (Audio Dedupe, Music Library Doctor) sell.

**Effort:** L. **Wow-per-effort:** 4.

**Risks.**

- Schema migration + a full-library backfill pass (rides F1, so sequence F1 first).
- The reconciliation-owner question above is the real cost, not the DSP.
- False positives: live versions, remasters, radio edits, and long ambient/lofi loops fingerprint
  close. Never auto-delete — surface, group, and let the user pick, with the fingerprint distance
  shown.
- `rusty-chromaprint` last published 2024-10; the algorithm is frozen (AcoustID compatibility) so
  staleness is low-risk, but it is a single-maintainer crate — vendor-review it, and keep the
  interface behind `shiranami-audio` so it can be swapped.
- Deleting a "duplicate" that is a playlist member must be a guarded, undoable flow.

---

### F4 — Gapless offsets and a crossfade that lands on the music

**What it is.** Each track stores where the audio _actually_ starts and ends — encoder delay/padding
plus measured lead-in/tail silence. The renderer's existing pre-buffer then starts the incoming deck
at the true first sample and hands over at the true last one, so album sides and DJ-style lofi tapes
play continuously; and the fixed crossfade stops chopping the final chord of a track that already
faded out on its own.

**Rust angle.**

- Free half: symphonia already decodes the LAME tag / iTunSMPB / Opus pre-skip into
  `Track { delay, padding }` (`symphonia-core-0.6.0/src/formats/mod.rs:270,273`;
  `symphonia-bundle-mp3-0.6.0/src/demuxer.rs:426-428`). `shiranami-audio` just has to read and
  expose them — `decode.rs:104-118` already has the `Track` in hand and throws it away.
- Measured half: a `SilenceSink` tracking first/last frame above a −60 dBFS threshold, riding F1.
- `shiranami-db`: `tracks.lead_in_ms real`, `tracks.tail_ms real`.
- Renderer: `apps/web/src/hooks/useAudioEngine.ts` — `preBufferRef` (:153-159) seeds
  `audio.currentTime = lead_in`, and the boundary check uses `duration − tail_ms` instead of
  `duration`.

**User payoff.** The nearest thing to "true gapless" that the settled architecture permits —
`docs/v2/architecture.md:20-27` fixes the audio engine in the renderer and `:59` lists true gapless as
a v2.0 non-goal, so this is the honest version of the feature. For continuous-mix lofi it's the
difference between an album and a playlist.

**Effort:** M. **Wow-per-effort:** 4.

**Risks.**

- **Do not call it "gapless."** `HTMLAudioElement` + `currentTime` scheduling is millisecond-jittery,
  not sample-exact. Release notes should say "seamless transitions" / "silence-aware crossfade";
  an audiophile who reads "gapless" and hears 8 ms will file a bug you cannot fix without moving
  playback into Rust.
- Interaction matrix with `crossfadeEnabled` / `crossfadeDuration` / `sleepFadeDuration`
  (`apps/web/src/stores/usePlaybackStore.ts:29-37`) needs explicit rules — three fade sources fighting
  over one gain node is how you get a click.
- Threshold choice: −60 dBFS trims noise-floor vinyl crackle intros that are _intentional_ on lofi
  records. Make the trim conservative and settable, default modest.
- Tracks analysed before this ships have NULL offsets — the renderer must degrade to today's
  behaviour per-track, not per-setting.

---

### F5 — ReplayGain-2.0-grade loudness: album mode, true-peak safety, dynamic range

**What it is.** A Track / Album / Off normalisation picker like foobar2000 and MusicBee. Album mode
preserves the intended dynamics _between_ tracks on a record (the quiet interlude stays quiet).
True-peak-aware gain stops the ±12 dB boost from clipping quiet masters. Loudness range (LRA) shown
as a "dynamics" figure on the track detail.

**Rust angle.** Almost pure configuration of an already-linked dependency:

- `crates/shiranami-audio/src/loudness.rs:109` goes from `Mode::I` to
  `Mode::I | Mode::TRUE_PEAK | Mode::LRA` (both verified present in `ebur128-0.1.10`, lines 67 & 70).
- Album gain = `EbuR128::loudness_global_multiple` (line 781) folded over the per-track states of one
  album — **no new crate at all.** Requires the batch to group by `(album, album_artist)`, which is
  natural inside F1.
- `shiranami-db`: `tracks.album_gain_db real`, `tracks.true_peak_db real`, `tracks.loudness_range real`.
- Renderer: `apps/web/src/lib/loudness.ts` `computeLoudnessGainDb` grows a mode parameter and a
  `min(gain, −true_peak_headroom)` clamp; `useAudioEngine.ts` `setDeckTrackLoudness` (:132-143)
  picks album vs track gain.

**User payoff.** The single most-requested audiophile checkbox in every local-player comparison, and
the fix for a real latent bug — today a −28 LUFS ambient track gets +12 dB with no peak guard.

**Effort:** M (S if it lands inside F1's batch). **Wow-per-effort:** 4.

**Risks.**

- Album grouping is genuinely ambiguous: compilations, `album_artist` NULLs, and the
  `Unknown Album` sentinel (`shiranami_core::UNKNOWN_ALBUM`, guarded in
  `crates/shiranami-recommendation/src/core/similarity.rs:16`) must never group into one giant
  pseudo-album.
- Existing `loudness_lufs` values are a continuity contract (`shiranami-audio/src/lib.rs:33-38`:
  "carried across with the database and never re-measured"). Adding album gain must not trigger a
  silent re-measure of the integrated value or the numbers drift for people mid-upgrade.
- True peak costs a 4× oversample in `ebur128` — measurable but small next to the decode; verify on
  the F1 benchmark before enabling by default.

---

### F6 — Instant library search on FTS5

**What it is.** Search that is ranked (bm25), accent-folded, prefix- and substring-capable, and stays
instant on a 50,000-track library — replacing the JS `.includes()` scan over the whole in-memory
array.

**Rust angle.**

- **Zero new dependencies: FTS5 is already compiled into the shipped binary** (§0.7 —
  `libsqlite3-sys-0.37.0/build.rs:132` and a `strings` hit on `target/release/shiranami-desktop`).
- `shiranami-db` migration: an external-content FTS5 table over `tracks(title, artist, album,
album_artist, genre)` with `tokenize='unicode61 remove_diacritics 2'`, plus INSERT/UPDATE/DELETE
  triggers; optionally a second `trigram`-tokenised table for substring/CJK.
- New `tracks::search(conn, query, limit)` in `crates/shiranami-db/src/repo/tracks.rs` and a
  `db:tracks:search` command.
- Renderer: `LibraryView.hooks.ts:34-43` swaps its `useMemo` for a debounced query; the same query
  powers `CommandPalette`.

**User payoff.** Search that doesn't degrade as the library grows, finds "beyoncé" when you type
"beyonce", and ranks title matches above album matches instead of returning them in table order.

**Effort:** S/M. **Wow-per-effort:** 4 (best payoff-to-lines ratio on the list).

**Risks.**

- The renderer still calls `tracks::get_all` (`repo/tracks.rs:48`) and holds the library in memory;
  if the search path isn't rerouted, this is invisible work. Scope must include the renderer edit.
- Index consistency across `add_many` / `update_many` / `remove_many` / adoption. Prefer triggers
  over hand-maintained inserts, and add a "rebuild index" repair.
- FTS ranking changes result _order_ — the existing tests/stories that assert filtered output will
  move. Expect churn in `LibraryView` tests.
- Must survive the v1→v2 adoption path (`crates/shiranami-db/src/adopt/`) — build the index on first
  open if absent rather than assuming a migration ran.

---

### F7 — "Sounds like this": local sonic similarity

**What it is.** Plexamp's Super Sonic, offline. Right-click → "Radio from this track" and get a queue
that actually _sounds_ like the seed — same tempo band, same brightness, same density — rather than
"same artist tag."

**Rust angle.**

- `shiranami-audio` emits a compact per-track feature vector during F1's decode: spectral centroid /
  rolloff / flatness / flux, zero-crossing rate, RMS dynamics, the 12-bin chroma from F2, tempo, LUFS
  and LRA from F5. All of it is `realfft` over the same windows F2 already computes — the marginal
  cost is near zero once F2 exists.
- `shiranami-db`: `tracks.features blob` (fixed-width `f32` array, versioned by a `features_version`
  column so a future algorithm change invalidates cleanly).
- `shiranami-recommendation/src/core/similarity.rs` gains a content axis alongside the existing
  `same_artist` / `same_album` / `per_shared_playlist` weights (:21-23) — brute-force kNN over
  z-scored vectors is entirely adequate at 10k–50k tracks and keeps the crate dependency-free.
- Also upgrades `service/similar.rs` and the "More like this" shelf in `service/shelves.rs`.

**User payoff.** The single most-requested discovery feature on the Roon and Plex forums, and the
thing a lofi library needs most, because artist/album tags on YouTube-sourced lofi are near-useless
(the similarity module already documents that genre is "too sparse to drive recommendations" —
`core/similarity.rs:8-11`). This is the feature that _cannot_ exist without a real decoder in-process.

**Effort:** L. **Wow-per-effort:** 3 (highest ceiling, highest variance).

**Risks.**

- **Licence trap, and it is the whole reason this is L not M:** `bliss-audio` (GPL-3.0-only) and
  `aubio-rs` (GPL-3.0) are the two off-the-shelf answers and **both are unusable** under the
  Shiranami Source Available License. Everything must be hand-rolled. Do not let this get discovered
  mid-implementation.
- Quality is a research problem. Unweighted Euclidean over raw features produces results that feel
  random; needs per-dimension z-scoring at minimum, and honest evaluation ("does the mix feel right
  on my own library?") before it ships. Budget a tuning week.
- Cold start: useless until F1 has run over the library. Needs a clear "analyse to unlock" state.
- Scope discipline: resist MFCCs/ML. A dozen hand-picked spectral statistics is the shippable version.

---

### F8 — Library Doctor: what only a real decoder can tell you

**What it is.** A health report over the library: files that fail to decode, truncated downloads,
digitally-silent tracks, clipped masters (true peak > 0 dBFS), tracks whose container duration lies
about the real length, mono files stored as stereo, plus the existing tag gaps — each with a fix or
a "reveal in Finder".

**Rust angle.** Nearly free once F1 exists — every signal is a by-product the decoder already
produces:

- decode failures already have a taxonomy (`crates/shiranami-audio/src/error.rs`:
  `UnsupportedCodec`, `NoAudioTrack`, `Decode`), and `decode.rs:139-146` _silently skips_ damaged
  packets today — counting them turns a hidden defect into a report line.
- truncation: `decode.rs:126-133` already special-cases `UnexpectedEof` ("a truncated file ends
  mid-packet") — currently invisible to the user.
- duration lie: `DecodeSummary::duration_secs` (`decode.rs:66-74`) is derived from frames actually
  decoded, deliberately unlike the container field — comparing the two is the check, for free.
- silence: `IntegratedLoudness::Silent` already exists (`loudness.rs`).
- clipping: true peak from F5.

**User payoff.** "11 files in your library are broken and you didn't know" is a strong, concrete,
screenshot-friendly result, and it is _especially_ apt for a library built from yt-dlp downloads
where half-finished files are common.

**Effort:** S (on top of F1). **Wow-per-effort:** 4.

**Risks.**

- Alarm fatigue: a report that flags 400 things nobody cares about gets dismissed forever. Rank by
  severity, default to showing only actionable items.
- Opus/WMA are a known decode gap (`decode.rs:19-33`) and must be reported as "cannot analyse", never
  as "broken" — that would be a false accusation about a file that plays fine in the webview.
- "Fix" actions that touch files need the existing path-containment guards and a trash-not-delete
  policy (`trash` is already pinned, `Cargo.toml:63`).

---

### F9 — Year in Review / listening report

**What it is.** A Spotify-Wrapped-shaped recap over the local `play_history` — top tracks/artists by
month, total hours, longest streak, the track you played most at 2 a.m., first-listen dates,
biggest-jump artist — exportable as a share card image.

**Rust angle.**

- `crates/shiranami-db/src/repo/history/read.rs` already has `summary` (totals + top-5
  leaderboards over an exclusive window, :68-77), `activity` (per-day, :167-178) and
  `hourly_activity` (day-of-week × hour, :202-). Extending it is more of the same SQL, and the point
  of doing it in Rust/SQL is that 100k history rows never cross the bridge — the renderer receives a
  finished report object, not a table.
- The share card can be rendered natively with the already-pinned `image` crate (`Cargo.toml:204`)
  and the art cache, so export is a PNG, not a `html2canvas` screenshot.
- Also worth adding: `SESSION_GAP` is already defined in that file (:14-16), so "listening sessions"
  is a stat that is one query away.

**User payoff.** Delight and shareability, with real screenshot value for the release post. Every
local-player community asks for it and almost none ship it, because their history lives in a format
they can't aggregate cheaply.

**Effort:** M. **Wow-per-effort:** 3 (high delight, but the thinnest "only Rust could do this" story
— be honest about that in the release notes and let the native share-card export carry the engine angle).

**Risks.**

- Timezone handling is already split deliberately in that file (UTC day keys for the calendar, local
  for hourly — `read.rs:167-176`). A "year" boundary must pick one and document it.
- Needs enough history to be interesting; a fresh install shows a sad empty card. Gate the entry
  point on a minimum play count.
- Scope creep into a full analytics dashboard. One page, one export.

---

### F10 — Live folder watching (auto-import)

**What it is.** Drop a file into a watched folder and it appears in the library. Delete it and the
row is flagged. Downloads land without a manual rescan.

**Rust angle.**

- `notify = "8.2"` (CC0) + `notify-debouncer-full = "0.7"` (MIT/Apache) in `shiranami-library`.
  `docs/v2/architecture.md:1070-1075` explicitly reserved this: "`notify` is not used and is not
  pinned… adding one would be a new feature wearing a port's clothes" — v2.x is where it stops being
  a port.
- One OS-level watcher (FSEvents / ReadDirectoryChangesW / inotify) costs a thread and no polling —
  in Electron this would have been chokidar walking the tree on a JS event loop.
- Pairs with F3: with a fingerprint, a move event _updates_ a row instead of orphaning it.

**User payoff.** The library stops being something you have to remember to refresh.

**Effort:** M. **Wow-per-effort:** 2.5.

**Risks.**

- Event storms: an rsync or a 500-file download batch must coalesce, hence the debouncer.
- Network shares and removable volumes generate garbage events or none at all; needs a per-folder
  opt-out and a fallback rescan.
- Reconciliation lives in the renderer today (see F3) — a watcher that can't decide what to do with
  an event is just a notification.
- Platform behaviour diverges enough that this needs real testing on both macOS and Windows;
  `docs/v2/architecture.md` §6.1 CI has no fixture for it.

---

## 2. Ranking

Ordered by wow-per-effort, then by strategic leverage (does it unlock the others?) and
"could v1 have shipped this?".

| #   | Feature                                                         | Effort          | Wow/effort | Depends on              |
| --- | --------------------------------------------------------------- | --------------- | ---------- | ----------------------- |
| 1   | **F1** Parallel one-pass analysis engine                        | M               | 5          | — (unlocks 2,3,4,5,7,8) |
| 2   | **F2** Tempo & key detection in Rust (rung 3)                   | M               | 4          | F1                      |
| 3   | **F3** Content fingerprints → move detection + duplicate finder | L               | 4          | F1                      |
| 4   | **F4** Gapless offsets + silence-aware crossfade                | M               | 4          | F1                      |
| 5   | **F5** Album-mode ReplayGain + true-peak safety + LRA           | M (S inside F1) | 4          | F1                      |
| 6   | **F6** Instant FTS5 library search                              | S/M             | 4          | —                       |
| 7   | **F8** Library Doctor (decode-truth health report)              | S               | 4          | F1, F5                  |
| 8   | **F7** "Sounds like this" local sonic similarity                | L               | 3          | F1, F2                  |
| 9   | **F9** Year in Review + native share card                       | M               | 3          | —                       |
| 10  | **F10** Live folder watching                                    | M               | 2.5        | (F3)                    |

**Suggested release shape.** F1 is the trunk — it is the literal "powered by the new engine" story
and everything above it in wow terms hangs off it. A tight, coherent v2.1 is **F1 + F2 + F5 + F6**
(one analysis pass that produces tempo, key, album gain and peak safety, plus search that never
slows down), with **F8** thrown in nearly free. **F3** is the highest-value single feature but is the
one that needs a design decision first (who owns reconciliation), so it wants its own milestone.
**F7** is the marquee feature for v2.2 once F1/F2 have been proven on real libraries.

---

## 3. Top 3 — release-notes pitches

1. **F1 — Parallel analysis engine.** "Analyse your whole library in one pass: the new Rust engine
   decodes each track once and measures everything at the same time, across every core your machine
   has — waveforms, loudness, tempo and key, all from a single sweep."

2. **F2 — Tempo & key detection.** "Shiranami now hears the beat: every track gets an estimated BPM
   and musical key, so you can build a 70-BPM late-night mix or keep a whole set in the same key."

3. **F3 — Fingerprint identity & duplicate finder.** "Reorganise your music folder without losing a
   thing — tracks are now identified by how they sound, not where they sit, so play counts,
   favourites and playlists follow your files, and the duplicate finder catches the same song twice
   even across different formats."

---

## 4. Open questions for the product decision

1. **The `feat/native-bpm-key-addon` branch** — port-and-delete, or keep as a historical artefact?
   Either way the v1 migration `20260101000008_track_bpm_key` needs an explicit answer in
   `crates/shiranami-db/src/adopt/` or dev profiles keep hitting refusal #10.
2. **Who owns library reconciliation in v2?** It is in the renderer today by deliberate port
   fidelity (`docs/v2/architecture.md:1040-1053`). F3 and F10 both need that answered before code.
3. **Is a new `realfft` pin acceptable** as the sole Appendix-B addition for the DSP features?
   §2.9 already predicted it, so this is likely a formality.
4. **Battery/thermal policy** for F1 — is "use all cores by default" acceptable on a laptop, or does
   the release need a core-count setting from day one?
5. **How much of `apps/web` is in scope?** F4, F5 and F6 all require renderer edits, and §1.3's
   "`apps/web` stays, ~1 new folder" was a _port_ constraint, not a feature-freeze — worth stating
   that explicitly so the boundary doesn't get defended by accident.

---

## 5. Files a builder will care about

**Grow these:**

- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/sink.rs` — the fan-out seam
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/lib.rs` — module list + the "Rung 3" doc that becomes real
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/loudness.rs:109` — `Mode::I` → `Mode::I | TRUE_PEAK | LRA`
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/decode.rs:104-118` — where symphonia's `Track { delay, padding }` is currently discarded
- `/Users/shirone/Documents/Projects/shiranami/apps/desktop-tauri/src-tauri/src/commands/loudness.rs:258-330` — the sequential loop to parallelise
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-db/migrations/` — `0002_scrobble_queue.sql` is the template for post-baseline migrations
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-db/src/repo/tracks.rs` — `get_all:48`, plus where `search` belongs
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-recommendation/src/core/similarity.rs:21-23` — the weights a content axis joins
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-recommendation/src/core/mixes.rs:26-38` — `MixTrack`, where tempo becomes a mix axis
- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/hooks/useAudioEngine.ts:132-159` — deck loudness + pre-buffer
- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/lib/loudness.ts` — `computeLoudnessGainDb`
- `/Users/shirone/Documents/Projects/shiranami/apps/web/src/components/library/LibraryView/LibraryView.hooks.ts:34-43` — the substring filter FTS5 replaces

**Read, don't modify:**

- `/Users/shirone/Documents/Projects/shiranami/docs/v2/architecture.md` — §1.2 (:45), §2.9 (:336), §3.3 (:434), Phase 10 amendments (:1037-1075), the bpm/key migration collision (:2130)
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-library/src/scan/parse.rs` — the private-rayon-pool precedent
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/tests/addon_parity.rs` — the parity-test shape for porting DSP
- `/Users/shirone/Documents/Projects/shiranami/crates/shiranami-audio/src/peaks/cache.rs` — the frozen cache-key construction
- `git show feat/native-bpm-key-addon:apps/desktop/src/native/core/{tempo,key,fft}.cpp` — the porting brief
- `/Users/shirone/Documents/Projects/shiranami/LICENSE` — why GPL crates are out
