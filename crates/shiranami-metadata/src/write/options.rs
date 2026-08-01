//! What a tag write is asked to change.
//!
//! Ported from `WriteMetadataOptions` in
//! `apps/desktop/src/main/services/metadata-writer.ts`.

/// A per-field instruction.
///
/// v1 encoded this as JavaScript's three-way `undefined` / `null` / value, and
/// the distinction is load-bearing: the renderer's tag editor sends only the
/// fields the user touched, and an emptied field must *remove* the frame rather
/// than be ignored. `Option<Option<T>>` would say the same thing far less
/// legibly, so it gets a name.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum FieldEdit<T> {
    /// Leave whatever the file already has. v1's `undefined`.
    #[default]
    Keep,
    /// Remove the field from the file. v1's `null`.
    Clear,
    /// Write this value.
    Set(T),
}

impl<T> FieldEdit<T> {
    /// Build from v1's wire shape, where the field is absent or nullable.
    ///
    /// `None` is [`FieldEdit::Keep`]; `Some(None)` is [`FieldEdit::Clear`].
    pub fn from_nullable(value: Option<Option<T>>) -> Self {
        match value {
            None => Self::Keep,
            Some(None) => Self::Clear,
            Some(Some(value)) => Self::Set(value),
        }
    }

    /// Whether this edit changes anything.
    pub fn is_keep(&self) -> bool {
        matches!(self, Self::Keep)
    }
}

impl FieldEdit<String> {
    /// Normalise an empty string to [`FieldEdit::Clear`].
    ///
    /// v1 disagreed with itself here: an empty string dropped the frame on the
    /// mp3 path (node-id3 bails on falsy input) and on the ffmpeg path
    /// (`-metadata title=` deletes), but was written literally as `TITLE=` on
    /// the flac path. Two of three, and the two that agree are the sensible
    /// reading — a user who clears the box means "remove this", not "store an
    /// empty string" — so v2 normalises rather than reproducing the split.
    pub(crate) fn normalized(self) -> Self {
        match self {
            Self::Set(value) if value.is_empty() => Self::Clear,
            other => other,
        }
    }
}

/// The tag edits to apply to one file.
///
/// Every field defaults to [`FieldEdit::Keep`], so
/// `WriteTagsOptions { title: FieldEdit::Set(..), ..Default::default() }`
/// touches exactly one frame.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WriteTagsOptions {
    /// Track title.
    pub title: FieldEdit<String>,
    /// Track artist.
    pub artist: FieldEdit<String>,
    /// Album artist, for grouping.
    pub album_artist: FieldEdit<String>,
    /// Album title.
    pub album: FieldEdit<String>,
    /// Genre.
    pub genre: FieldEdit<String>,
    /// Release year.
    pub year: FieldEdit<i32>,
    /// Position within the album.
    pub track_number: FieldEdit<i32>,
    /// Disc number.
    pub disc_number: FieldEdit<i32>,
    /// Cover image bytes to embed, in any format a decoder recognises.
    ///
    /// v1 also carried a `coverImageMime` and refused to cache the art unless
    /// *both* were present. v2 sniffs the format from the bytes — which is what
    /// the cache did anyway, since `saveAlbumArt(data, _mimeType)` ignored the
    /// MIME it was handed — so the second field has nothing left to do.
    pub cover: Option<Vec<u8>>,
}

impl WriteTagsOptions {
    /// Whether this would change anything at all.
    ///
    /// v1 early-returned on an empty tag object rather than rewriting the file
    /// for nothing. That matters more in v2, where a write means copying the
    /// whole file to a temp and renaming it back.
    pub fn is_empty(&self) -> bool {
        self.cover.is_none()
            && self.title.is_keep()
            && self.artist.is_keep()
            && self.album_artist.is_keep()
            && self.album.is_keep()
            && self.genre.is_keep()
            && self.year.is_keep()
            && self.track_number.is_keep()
            && self.disc_number.is_keep()
    }
}

/// What a tag write did.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WriteOutcome {
    /// The `tracks.album_art` value for the embedded cover, when one was given.
    pub album_art_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_three_way_edit_maps_from_v1s_wire_shape() {
        assert_eq!(FieldEdit::<i32>::from_nullable(None), FieldEdit::Keep);
        assert_eq!(
            FieldEdit::<i32>::from_nullable(Some(None)),
            FieldEdit::Clear
        );
        assert_eq!(FieldEdit::from_nullable(Some(Some(7))), FieldEdit::Set(7));
    }

    #[test]
    fn an_empty_string_is_a_clear_not_a_value() {
        assert_eq!(
            FieldEdit::Set(String::new()).normalized(),
            FieldEdit::Clear,
            "an emptied editor field removes the frame"
        );
        assert_eq!(
            FieldEdit::Set("x".to_owned()).normalized(),
            FieldEdit::Set("x".to_owned())
        );
        assert_eq!(FieldEdit::<String>::Keep.normalized(), FieldEdit::Keep);
    }

    #[test]
    fn a_default_options_set_changes_nothing() {
        assert!(WriteTagsOptions::default().is_empty());
    }

    #[test]
    fn any_single_edit_makes_the_options_non_empty() {
        let with_title = WriteTagsOptions {
            title: FieldEdit::Set("x".to_owned()),
            ..Default::default()
        };
        assert!(!with_title.is_empty());

        // A clear is a change too — v1's bug-prone case, since `null` is falsy.
        let with_clear = WriteTagsOptions {
            year: FieldEdit::Clear,
            ..Default::default()
        };
        assert!(!with_clear.is_empty());

        let with_cover = WriteTagsOptions {
            cover: Some(vec![1, 2, 3]),
            ..Default::default()
        };
        assert!(!with_cover.is_empty());
    }
}
