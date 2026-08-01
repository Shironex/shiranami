//! Turning a [`TrackUpdateInput`] into a `SET` clause.
//!
//! The whole module exists to keep one distinction intact. v1's update handlers
//! passed the renderer's payload straight to drizzle's `.set(data)`, where an
//! **absent** key leaves the column alone and a key set to **`null`** writes SQL
//! `NULL`. [`shiranami_core::models::Patch`] is how that survives the port; this
//! is where it turns back into SQL:
//!
//! | Patch state     | Assignment      |
//! | --------------- | --------------- |
//! | `None`          | none emitted    |
//! | `Some(None)`    | `col = NULL`    |
//! | `Some(Some(v))` | `col = v`       |
//!
//! Collapsing the first two — the mistake a plain `Option` would make — turns
//! "rename this track" into "wipe its artist, album, genre and year", silently,
//! on a library the user cannot undo.
//!
//! `file_path` and `title` are `NOT NULL` columns and so are plain `Option`s:
//! present means set, absent means leave alone, and there is no third state.

use shiranami_core::models::TrackUpdateInput;
use sqlx::{QueryBuilder, Sqlite};

/// Push `col = ?` for every field the patch speaks about, comma-separated.
///
/// Returns how many assignments were pushed. Zero means the patch said nothing,
/// and the caller must not emit an `UPDATE` at all — `SET` with an empty list is
/// a syntax error, and v1 hit drizzle's "No values to set" throw in the same
/// situation.
///
/// Every value is bound. The only text this contributes to the statement is the
/// column names below, which are literals in this file.
pub(crate) fn push_assignments(
    builder: &mut QueryBuilder<Sqlite>,
    patch: &TrackUpdateInput,
) -> usize {
    let mut count = 0;
    let mut set = builder.separated(", ");

    // `NOT NULL` columns: present or absent, never cleared.
    if let Some(file_path) = patch.file_path.as_deref() {
        set.push("file_path = ");
        set.push_bind_unseparated(file_path.to_owned());
        count += 1;
    }
    if let Some(title) = patch.title.as_deref() {
        set.push("title = ");
        set.push_bind_unseparated(title.to_owned());
        count += 1;
    }

    // Nullable columns: the three-state fields.
    for (column, value) in [
        ("artist = ", &patch.artist),
        ("album_artist = ", &patch.album_artist),
        ("album = ", &patch.album),
        ("genre = ", &patch.genre),
        ("album_art = ", &patch.album_art),
    ] {
        if let Some(text) = value {
            set.push(column);
            set.push_bind_unseparated(text.clone());
            count += 1;
        }
    }

    for (column, value) in [
        ("year = ", &patch.year),
        ("track_number = ", &patch.track_number),
        ("disc_number = ", &patch.disc_number),
    ] {
        if let Some(number) = value {
            set.push(column);
            set.push_bind_unseparated(*number);
            count += 1;
        }
    }

    if let Some(duration) = &patch.duration {
        set.push("duration = ");
        set.push_bind_unseparated(*duration);
        count += 1;
    }

    count
}

/// A grouping key that tells the three [`shiranami_core::models::Patch`] states
/// apart.
///
/// `db:tracks:update-many`'s sole caller (metadata-enrich apply) sends patches
/// that repeat heavily — a whole album getting the same album/artist/year fix —
/// so v1 grouped identical ones with `JSON.stringify` and applied each to all
/// its ids in one `IN (…)` update. This is that key.
///
/// `Debug` rather than JSON because JSON is what makes the mistake: serializing
/// `TrackUpdateInput` renders both `None` and `Some(None)` as `null`, which
/// would merge "leave the artist alone" with "clear the artist" into one group
/// and apply whichever won to every id in it. `Debug` prints `None` and
/// `Some(None)` differently.
///
/// Grouping is an optimisation, so the risk is asymmetric: splitting a group
/// that could have merged costs one extra statement, merging two that differ
/// corrupts data. This errs the safe way — distinct `f64` bit patterns print
/// distinctly, and the only values `Debug` renders alike (two `NaN`s) would
/// write the same thing anyway.
pub(crate) fn grouping_key(patch: &TrackUpdateInput) -> String {
    format!("{patch:?}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sql_for(patch: &TrackUpdateInput) -> (String, usize) {
        let mut builder = QueryBuilder::<Sqlite>::new("UPDATE tracks SET ");
        let count = push_assignments(&mut builder, patch);
        (builder.sql().as_str().to_owned(), count)
    }

    #[test]
    fn an_absent_field_is_not_assigned_and_an_explicit_null_is() {
        let (absent, absent_count) = sql_for(&TrackUpdateInput::default());
        assert_eq!(absent_count, 0, "an all-absent patch says nothing");
        assert_eq!(absent, "UPDATE tracks SET ");

        let (cleared, cleared_count) = sql_for(&TrackUpdateInput {
            artist: Some(None),
            ..TrackUpdateInput::default()
        });
        assert_eq!(cleared_count, 1);
        assert_eq!(cleared, "UPDATE tracks SET artist = ?");
    }

    #[test]
    fn assignments_are_comma_separated_in_column_order() {
        let (sql, count) = sql_for(&TrackUpdateInput {
            title: Some("Alpha".to_owned()),
            album: Some(Some("Nocturne".to_owned())),
            year: Some(Some(2026)),
            duration: Some(Some(201.5)),
            ..TrackUpdateInput::default()
        });

        assert_eq!(count, 4);
        assert_eq!(
            sql,
            "UPDATE tracks SET title = ?, album = ?, year = ?, duration = ?"
        );
    }

    /// The bug the key exists to prevent: JSON would render both as `null`.
    #[test]
    fn the_grouping_key_separates_absent_from_cleared() {
        let absent = TrackUpdateInput::default();
        let cleared = TrackUpdateInput {
            artist: Some(None),
            ..TrackUpdateInput::default()
        };
        let set = TrackUpdateInput {
            artist: Some(Some("Aoi".to_owned())),
            ..TrackUpdateInput::default()
        };

        assert_ne!(grouping_key(&absent), grouping_key(&cleared));
        assert_ne!(grouping_key(&cleared), grouping_key(&set));
        assert_eq!(grouping_key(&set), grouping_key(&set.clone()));
    }
}
