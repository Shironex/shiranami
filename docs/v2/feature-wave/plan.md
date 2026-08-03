# v2.0 pre-release feature wave — the chosen set

Decided 2026-08-03 (user-approved "Recommended set"). The v2 release is held until this wave lands. Research grounding: the three `research-*.md` files beside this plan; each feature's detailed spec lives there.

## Lanes

**Lane V — "the app breathes" (visual, apps/web):** sequential inside the lane

1. Foundation: Artwork Bloom (research-visual #2) + palette theming (#4) + visual crossfade (#10)
2. Sanctuary Mode (#1) + Lyric Focus (#5)

**Lane R — "the engine hears" (Rust crates):** sequential inside the lane

1. One-pass analysis engine (research-rust F1): PcmSink fan-out, one decode feeds waveform+LUFS+(BPM/key), rayon across library
2. Tempo & key (F2): port the unit-tested C++ algorithm from `feat/native-bpm-key-addon` onto realfft (MIT — the GPL crates are unusable under the license); migration 0003 for bpm/key columns; **explicitly settle adoption for profiles carrying the stranded branch's `track_bpm_key` migration** (the user's own dev profile)

**Lane D — "it keeps you company" (apps/web + small commands):** sequential inside the lane

1. Wind down (research-delight #3): authored ending — dim, calmest-remaining-track queue (LUFS exists), next-launch memory
2. This week, quietly (#2): weekly recap cards on Overview, archived; requires `until` binds on the three history reads that lack them

**Lane X — riders (backend + light UI):** sequential inside the lane

1. Instant FTS5 search (research-rust F6 — FTS5 already compiled in)
2. Album-mode ReplayGain + true-peak (F5 — zero new deps)
3. Library Doctor (F8 — surface what decode.rs already measures)

**Closing (after V+R merge): tempo-locked breathing** (research-visual #8) — `--beat-duration` breathing on bloom/mascot/compact ring at half/quarter time; never flashes.

## Rules

Same discipline as the port: worktree lanes, conventional commits, all gates green (cargo + pnpm + drift guards), lane reports name deviations, coordinator merges. Renderer additions follow the repo's component/folder/lint conventions and the polish checklist. Backlogged for v2.1: Living Scenes, Nami's notes, fingerprint identity, sounds-like, moment cards, seasons, desk companion.
