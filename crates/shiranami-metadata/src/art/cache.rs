//! The content-addressed album-art cache: directory, hash, filename, URL, and
//! the adopt-don't-rewrite write path.
//!
//! Ported from `saveAlbumArt` in
//! `apps/desktop/src/main/protocols/art-protocol.ts` and `artUrlFor` in
//! `apps/desktop/src/main/shared/album-art-image.ts`.
//!
//! Everything in this module *is* the v1 contract and is reproduced exactly:
//! the directory name, the hash algorithm, the 32-hex truncation, the `.jpg`
//! suffix, the `shiranami-art://art/` URL prefix, and the create-exclusive
//! write whose `EEXIST` is the dedupe happy path rather than an error. The one
//! thing that is *not* reproduced is the bytes fed into the hash — see the
//! module docs on [`crate::art`].

use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::error::{MetadataError, Result};

/// Directory holding the cache, relative to the app data directory.
///
/// v1: `path.join(app.getPath('userData'), 'album-art')`. First-run continuity
/// (architecture §3.1 step 3) copies this directory across verbatim, so the
/// name is a compatibility constraint.
pub const ART_DIR_NAME: &str = "album-art";

/// How many hex characters of the SHA-256 digest name the file.
///
/// v1: `ALBUM_ART_HASH_LENGTH = 32`, i.e. 128 bits. Every filename already on
/// every user's disk is this length, so it is frozen regardless of whether 128
/// bits would be the choice today.
pub const HASH_LENGTH: usize = 32;

/// The URL scheme and host `tracks.album_art` values are built from.
///
/// v1 stored a full URL, not a bare hash: `shiranami-art://art/<hash>.jpg`.
/// Architecture §2.4 replaces the custom scheme with a loopback HTTP server, so
/// v2 *serves* these differently — but the stored strings are already in every
/// user's database and are not rewritten, so this crate keeps producing them
/// and the serve layer translates at read time.
pub const ART_URL_PREFIX: &str = "shiranami-art://art/";

/// Resolve the cache directory beneath an app data directory.
pub fn art_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(ART_DIR_NAME)
}

/// Content-address encoded cover bytes.
///
/// `sha256(bytes)` truncated to [`HASH_LENGTH`] hex characters, exactly as both
/// v1 pipelines did. The input must be the *encoded* bytes — the JPEG the cache
/// will store — never the source the tag held.
pub fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);

    let mut hex = String::with_capacity(HASH_LENGTH);
    // Two hex characters per byte, so only the first half of the truncation
    // length is ever formatted.
    for byte in digest.iter().take(HASH_LENGTH / 2) {
        use std::fmt::Write as _;
        let _ = write!(hex, "{byte:02x}");
    }
    hex
}

/// The cache filename for a hash.
pub fn file_name_for(hash: &str) -> String {
    format!("{hash}.jpg")
}

/// The `tracks.album_art` value for a cache filename.
pub fn art_url_for(file_name: &str) -> String {
    format!("{ART_URL_PREFIX}{file_name}")
}

/// Extract a cache filename from a stored `tracks.album_art` value.
///
/// Returns `None` for anything that is not a `shiranami-art://` URL. That is
/// load-bearing for pruning: the same column legitimately holds `https://`
/// covers and legacy `data:` URLs, and treating either as a cache reference
/// would make the prune pass delete live files. Ported from
/// `artFileNameFromUrl`.
///
/// The trailing `basename` is a path-traversal guard, and v1 has a test pinning
/// that `shiranami-art://art/../../etc/passwd` reduces to `passwd`.
pub fn file_name_from_url(url: Option<&str>) -> Option<String> {
    let url = url?;
    if !url.starts_with("shiranami-art://") {
        return None;
    }

    // v1 parsed with `new URL` and took `basename(pathname)`. Because the
    // scheme is registered `standard: true`, `art` is the *host* and the
    // pathname is `/<file>.jpg`. Splitting on `/` reaches the same place
    // without depending on a URL parser's opinion of a custom scheme.
    let without_scheme = url.strip_prefix("shiranami-art://")?;
    let path = without_scheme.split(['?', '#']).next().unwrap_or_default();
    let last = path.rsplit('/').next().unwrap_or_default();

    if last.is_empty() {
        return None;
    }
    Some(last.to_owned())
}

/// Where a hash lives on disk.
pub fn cache_path(data_dir: &Path, hash: &str) -> PathBuf {
    art_dir(data_dir).join(file_name_for(hash))
}

/// Run cover bytes through the pipeline and store them, returning the
/// `tracks.album_art` value.
///
/// Returns `Ok(None)` when the bytes are not a decodable image, matching v1's
/// `null`.
///
/// **This is the adopt-don't-rewrite path (decision D16).** The write is
/// create-exclusive, so an existing entry with the same hash is left byte-for-
/// byte alone and the existing file keeps serving. Nothing in v2 ever rewrites
/// or re-encodes a cache entry that is already on disk, and nothing rehashes
/// the directory it inherited from v1.
pub fn save_cover(data_dir: &Path, cover: &[u8]) -> Result<Option<String>> {
    let Some(processed) = crate::art::image::process_cover(cover)? else {
        return Ok(None);
    };

    let hash = hash_bytes(&processed.bytes);
    let file_name = file_name_for(&hash);
    let directory = art_dir(data_dir);

    fs::create_dir_all(&directory).map_err(|source| {
        MetadataError::io("create the album-art directory", &directory, source)
    })?;

    let path = directory.join(&file_name);
    write_new_only(&path, &processed.bytes)?;

    Ok(Some(art_url_for(&file_name)))
}

/// Write bytes only if the path does not exist.
///
/// v1 used `fs.writeFile(path, bytes, { flag: 'wx' })` and swallowed `EEXIST`.
/// `create_new(true)` is the same `O_EXCL` open, and `AlreadyExists` is the
/// same happy path: two tracks sharing a cover converge on one file, and a
/// cover inherited from v1 is never overwritten by a v2 re-encode of the same
/// source. Any other error is real and propagates.
fn write_new_only(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write as _;

    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(mut file) => {
            file.write_all(bytes)
                .map_err(|source| MetadataError::io("write the cover cache entry", path, source))?;
            // The cache is content-addressed and regenerable, so a torn write
            // is recoverable by re-extraction — but a *half* file that exists
            // would be served forever, because `create_new` would then refuse
            // to replace it. `sync_data` is what makes the exclusive-create
            // guarantee mean "complete file".
            file.sync_data()
                .map_err(|source| MetadataError::io("flush the cover cache entry", path, source))?;
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(source) => Err(MetadataError::io(
            "write the cover cache entry",
            path,
            source,
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hash_is_thirty_two_hex_characters_of_sha256() {
        let hash = hash_bytes(b"cover bytes");

        assert_eq!(hash.len(), HASH_LENGTH);
        assert!(
            hash.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase())
        );

        // The full digest of `b"cover bytes"`, truncated by hand. If the
        // truncation ever changes end (or the algorithm changes), this fails.
        let full = format!("{:x}", Sha256::digest(b"cover bytes"));
        assert_eq!(hash, full[..HASH_LENGTH]);
    }

    #[test]
    fn the_url_shape_matches_what_v1_wrote_into_the_database() {
        assert_eq!(
            art_url_for("abc123.jpg"),
            "shiranami-art://art/abc123.jpg",
            "every existing row in `tracks.album_art` has this shape"
        );
    }

    #[test]
    fn a_stored_url_round_trips_back_to_its_filename() {
        let url = art_url_for(&file_name_for(&hash_bytes(b"bytes")));
        let name = file_name_from_url(Some(&url)).expect("a cache URL yields a filename");

        assert_eq!(name, file_name_for(&hash_bytes(b"bytes")));
    }

    #[test]
    fn non_cache_urls_are_not_cache_references() {
        // These three all live in `tracks.album_art` legitimately. Treating any
        // of them as a cache filename would make prune delete a live file.
        assert_eq!(file_name_from_url(Some("https://example.com/a.jpg")), None);
        assert_eq!(file_name_from_url(Some("data:image/png;base64,AAAA")), None);
        assert_eq!(file_name_from_url(Some("file:///music/cover.jpg")), None);
        assert_eq!(file_name_from_url(None), None);
        assert_eq!(file_name_from_url(Some("")), None);
    }

    #[test]
    fn a_traversal_attempt_reduces_to_its_basename() {
        // v1 pins this exact input and this exact output.
        assert_eq!(
            file_name_from_url(Some("shiranami-art://art/../../etc/passwd")).as_deref(),
            Some("passwd")
        );
    }

    #[test]
    fn a_url_with_no_filename_is_not_a_reference() {
        assert_eq!(file_name_from_url(Some("shiranami-art://art/")), None);
    }

    #[test]
    fn an_existing_entry_is_adopted_rather_than_rewritten() {
        // This is decision D16 in one test: a cache file inherited from v1 has
        // v1's bytes, and v2 must leave them exactly as they are.
        let directory = tempfile::tempdir().expect("a temp dir");
        let data_dir = directory.path();

        let v1_bytes = b"pretend these are sharp's JPEG bytes";
        let hash = hash_bytes(v1_bytes);
        fs::create_dir_all(art_dir(data_dir)).expect("the art dir is creatable");
        let path = cache_path(data_dir, &hash);
        fs::write(&path, v1_bytes).expect("the v1 entry writes");

        write_new_only(&path, b"v2 would have written something else")
            .expect("an existing entry is not an error");

        assert_eq!(
            fs::read(&path).expect("the entry is readable"),
            v1_bytes,
            "an adopted cache entry must never be rewritten"
        );
    }

    #[test]
    fn saving_a_cover_twice_produces_one_file() {
        let directory = tempfile::tempdir().expect("a temp dir");
        let data_dir = directory.path();

        let cover = super::super::tests_support::sample_png();

        let first = save_cover(data_dir, &cover).expect("a cover saves");
        let second = save_cover(data_dir, &cover).expect("a cover saves twice");

        assert_eq!(first, second, "content addressing collapses duplicates");
        assert!(first.is_some());

        let entries: Vec<_> = fs::read_dir(art_dir(data_dir))
            .expect("the art dir exists")
            .filter_map(std::result::Result::ok)
            .collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn undecodable_bytes_save_nothing_and_are_not_an_error() {
        let directory = tempfile::tempdir().expect("a temp dir");

        assert_eq!(
            save_cover(directory.path(), b"not an image").expect("garbage is not an error"),
            None
        );
    }

    #[test]
    fn the_saved_file_is_named_by_the_hash_of_its_own_bytes() {
        let directory = tempfile::tempdir().expect("a temp dir");
        let data_dir = directory.path();

        let url = save_cover(data_dir, &super::super::tests_support::sample_png())
            .expect("a cover saves")
            .expect("a valid cover is saved");

        let name = file_name_from_url(Some(&url)).expect("the URL names a file");
        let bytes = fs::read(art_dir(data_dir).join(&name)).expect("the entry exists");

        assert_eq!(
            file_name_for(&hash_bytes(&bytes)),
            name,
            "the cache is content-addressed by the bytes it stores"
        );
    }
}
