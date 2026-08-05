# Shiranami v2 — Companion: decision record

**Date:** 2026-08-05 · **Decided by:** Shirone, after three research lanes
(`research-priorart.md`, `research-visual.md`, `research-tech.md`) and an iterative design
artifact (four candidate characters → six across two directions).

## Verdict

Ship **two user-selectable companions**, chosen in _Settings → Interface → Companion_:

|     | Name                        | Concept                                                                                                                                                                                                      |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 潮  | **Shio** — the tide-cat     | Sitting chibi foam cat; the wave lives in its tail, growing from a stub into a foam-tufted breaking crest. Whiskers from stage II, accent inner-ears, headphones at stage IV, crescent-moon halo at stage V. |
| 蛍  | **Hotaru** — the star jelly | A moon jelly (海月, "sea moon") that fills with accent-lit glow-motes — one more per stage, a tiny night sky inside the bell — until the crescent perches on top at stage V. Tendrils trail the tempo.       |

Runner-up candidates (Awa the foam sprite, Namiko the wave-spirit, Kurage refined,
Tsukiyo's waxing-moon-on-a-stalk, Mikazuki, Maneki) are archived in the design artifact and
this folder's research docs. **Nami stays the greeter** (empty states, onboarding),
untouched. The moon motif — the part Shirone called out as loved — is threaded through
both species and can echo in Sanctuary Mode later.

## What "two companions" means (and doesn't)

- **A preference, not a collection.** One active companion at a time; no roster to
  complete, no acquisition pressure. This stays inside research-visual's "no gacha shelf"
  rule — the choice is _who lives with you_, like a theme, not _what you've collected_.
- **Growth belongs to the listener, not the pet.** XP is cumulative listening hours;
  switching species keeps the stage. Trying the other companion costs nothing.
- Both species implement the full 13-state machine from `research-visual.md` §Part 3,
  mapped onto their own bodies (Shio: tail = crest, hop on groove; Hotaru: mote pulse,
  tendril sway). Same pure reducer, two SVG rigs.

## Deltas to the research docs

1. `companion_state` (migration `0006_companion.sql`, research-tech §4) gains a
   `species TEXT NOT NULL DEFAULT 'shio'` column (`'shio' | 'hotaru'`). Everything else
   in the tech plan — accrual point, event flow, performance budget, phase breakdown —
   is species-independent and stands as written.
2. research-visual's single-character recommendation (Awa) is superseded by this record;
   its rig technique (layered SVG + CSS keyframes + WAAPI, `--art-*` recoloring), state
   machine, placement, and anti-annoyance rules all carry over unchanged.
3. Stage _names_ (Shizuku→Ōnami were Awa's tide names) are re-derived per species during
   Phase 3; thresholds stay 0/25/100/300/700 h.
4. Phase 2 ships both rigs behind one `<Companion />` component + the species picker in
   Settings; the picker previews both at perch size.

Design artifact (living document, includes interactive mockups of both species):
https://claude.ai/code/artifact/db025f45-4ef6-4bc2-9926-eb23ccf9b9c6
