-- Tempo and musical key on the track row.
--
-- The v2 feature wave's F2 (research-rust): the analysis engine estimates both
-- in one decode pass and persists them here; NULL means "not analysed yet" or
-- "analysed and nothing detectable" — the same collapse the addon branch's
-- service made, and the reason no sentinel value exists in this column.
--
-- Purely additive, so the compatibility floor stays 8 and the migration is
-- `backwardCompatible` in the §3.2 sense: a user who rolls back to v1 opens a
-- database with two extra nullable columns that drizzle's column-addressed
-- queries never touch.
--
-- The column set is deliberately IDENTICAL to the stranded v1 dev migration
-- `20260101000008_track_bpm_key` (the unmerged `feat/native-bpm-key-addon`
-- branch): same names, same order, same types, and no additions. That identity
-- is load-bearing — adoption recognises that migration in a dev profile's
-- drizzle ledger, verifies the columns are really there, and records THIS
-- migration as already satisfied instead of running it (see
-- `adopt/run.rs`), which is what turns refusal #10 for those profiles into a
-- clean open. A third column here (the once-considered `key_confidence`)
-- would break that equivalence and was deliberately left out; confidence is
-- computed per run and gates what gets stored rather than being stored itself.
--
-- `musical_key` holds the C++ era's exact strings ("C major", "A minor"), so
-- rows measured by the addon branch's dev builds and rows measured by the Rust
-- port sit side by side in one comparable column — the same continuity rule
-- `loudness_lufs` lives under.

ALTER TABLE `tracks` ADD `bpm` real;
ALTER TABLE `tracks` ADD `musical_key` text;
