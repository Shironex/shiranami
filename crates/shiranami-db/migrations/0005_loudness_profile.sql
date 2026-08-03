-- Album-mode ReplayGain and true-peak safety (feature wave, F5).
--
-- Three nullable reals beside `loudness_lufs`, all backend measurements the
-- analysis run writes and the renderer's gain math reads:
--
--   1. `album_loudness_lufs` — the BS.1770 integrated loudness of the track's
--      *album*, gated once across every member's blocks. Stored as LUFS rather
--      than as a baked gain (the research sketch said `album_gain_db`) for the
--      same reason `loudness_lufs` is: the gain is `target − measured`, and
--      the target is a user setting. Baking it in would strand every row the
--      moment the target slider moves. Tracks with no album, or on the
--      `Unknown Album` sentinel, keep `NULL` — album mode falls back to track
--      gain for them rather than treating the whole untagged pile as one
--      record.
--   2. `true_peak_db` — the loudest inter-sample peak in dBTP (ebur128's 4×
--      oversample). The renderer clamps positive gain so a boosted quiet
--      master cannot be pushed into clipping; v1 applied up to +12 dB with no
--      guard at all.
--   3. `loudness_range` — EBU Tech 3342 LRA in LU, a dynamics figure for the
--      track detail.
--
-- Purely additive-nullable, so the rollback window stays open and the
-- `user_version` floor stays 8: a v1 build reads a table whose extra columns
-- it never names (every v1 query lists its columns), exactly the
-- `album_artist`/`loudness_lufs` precedent from v1's own additive migrations.
--
-- `loudness_lufs` itself is untouched — rows measured by v1 are carried
-- across and never re-measured (shiranami-audio's continuity contract). The
-- analysis run fills these columns on tracks that already have an integrated
-- value without overwriting it.

ALTER TABLE `tracks` ADD COLUMN `album_loudness_lufs` real;
ALTER TABLE `tracks` ADD COLUMN `true_peak_db` real;
ALTER TABLE `tracks` ADD COLUMN `loudness_range` real;
