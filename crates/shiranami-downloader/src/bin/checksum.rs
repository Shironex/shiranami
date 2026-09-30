//! Checking a downloaded binary against the digest its upstream publishes.
//!
//! # What each upstream actually publishes
//!
//! Checked by hand on 2026-09-28, and the reason this module has two parsers
//! and not three:
//!
//! | Upstream   | Tool          | Published                                   | Verified here |
//! | ---------- | ------------- | ------------------------------------------- | ------------- |
//! | GitHub     | yt-dlp        | `SHA2-256SUMS` per release (`<hex>  <name>`) | yes           |
//! | gyan.dev   | ffmpeg (Win)  | `<archive>.sha256`, a bare hex digest        | yes           |
//! | evermeet.cx| ffmpeg (Mac)  | a detached OpenPGP `.sig` per archive, no digest | **no**    |
//!
//! evermeet.cx publishes no checksum at all, only a GPG signature. Verifying it
//! would mean an OpenPGP implementation and pinning the signer's key, which is
//! a dependency and a trust decision this module does not make on its own. So
//! the macOS ffmpeg install is **not** integrity-checked, and nothing here
//! pretends otherwise: there is no size comparison or other stand-in dressed up
//! as verification.
//!
//! # What a match proves, and what it does not
//!
//! The digest is fetched over TLS from the same host as the binary. A match
//! therefore proves the bytes on disk are the bytes the release published: no
//! truncation, no corrupted mirror, no half-written file promoted after a
//! crash. It does not defend against a compromised release, because whoever
//! could replace the binary could replace the sums file beside it. yt-dlp also
//! publishes an OpenPGP signature over `SHA2-256SUMS`; checking that is the
//! same follow-up as evermeet's.
//!
//! # No cryptography is written here
//!
//! The digest is `sha2`'s, the workspace's existing pin. What is hand-written is
//! reading 64 hex characters, which is parsing, not cryptography.

use std::path::Path;

use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

use crate::error::{DownloaderError, Result};

/// A SHA-256 digest.
pub type Sha256Digest = [u8; 32];

/// The file name yt-dlp publishes its digests under, in every release.
pub const YT_DLP_SUMS_FILE: &str = "SHA2-256SUMS";

/// What an install reports when the bytes do not match the published digest.
///
/// A sentence rather than a code: the install handlers put a failure's message
/// straight onto the `downloader.install_failed` payload the renderer shows.
pub const CHECKSUM_MISMATCH: &str =
    "The downloaded file does not match its published checksum, so it was not installed";

/// What an install reports when the upstream's digest list does not name the
/// asset that was downloaded.
pub const CHECKSUM_MISSING: &str = "The release does not publish a checksum for this download";

/// The digest listed for `asset` in a `sha256sum`-format document.
///
/// Each line is `<64 hex>  <name>`, or `<64 hex> *<name>` when the list was
/// produced in binary mode. Lines that do not parse are skipped rather than
/// failing the whole document, so a comment or a trailing blank line costs
/// nothing; the only answer that matters is whether *this* asset is listed.
pub fn parse_sums(document: &str, asset: &str) -> Option<Sha256Digest> {
    document.lines().find_map(|line| {
        let (digest, name) = line.trim().split_once(char::is_whitespace)?;
        let name = name.trim_start();
        let name = name.strip_prefix('*').unwrap_or(name);
        (name == asset).then(|| parse_hex(digest)).flatten()
    })
}

/// The digest in a document that holds only a digest, as gyan.dev's does.
///
/// Tolerates a trailing newline and a `sha256sum`-style file name after it,
/// in case the upstream ever changes to the conventional format.
pub fn parse_bare(document: &str) -> Option<Sha256Digest> {
    document.split_whitespace().next().and_then(parse_hex)
}

/// Read 64 hex characters into a digest.
fn parse_hex(text: &str) -> Option<Sha256Digest> {
    let bytes = text.as_bytes();
    if bytes.len() != 64 {
        return None;
    }

    let mut digest = [0_u8; 32];
    for (index, pair) in bytes.chunks_exact(2).enumerate() {
        let high = hex_value(pair[0])?;
        let low = hex_value(pair[1])?;
        digest[index] = (high << 4) | low;
    }
    Some(digest)
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// The SHA-256 of the file at `path`, read in chunks.
///
/// Streamed for the reason the download is: the Windows ffmpeg archive is well
/// over 100 MB and there is no reason to hold it in memory to hash it.
///
/// # Errors
///
/// [`DownloaderError::Io`] when the file cannot be read.
pub async fn digest_file(path: &Path) -> Result<Sha256Digest> {
    let io_error = |source| DownloaderError::Io {
        operation: "read the downloaded file to verify it",
        path: path.to_path_buf(),
        source,
    };

    let mut file = tokio::fs::File::open(path).await.map_err(io_error)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];

    loop {
        let read = file.read(&mut buffer).await.map_err(io_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().into())
}

/// Refuse the file at `path` unless its SHA-256 is `expected`.
///
/// # Errors
///
/// [`DownloaderError::InstallFailed`] carrying [`CHECKSUM_MISMATCH`] on a
/// mismatch, [`DownloaderError::Io`] when the file cannot be read.
pub async fn verify_file(path: &Path, expected: &Sha256Digest) -> Result<()> {
    let actual = digest_file(path).await?;

    if &actual == expected {
        return Ok(());
    }

    tracing::error!(
        path = %path.display(),
        expected = %to_hex(expected),
        actual = %to_hex(&actual),
        "a downloaded binary failed its checksum"
    );
    Err(DownloaderError::InstallFailed {
        message: CHECKSUM_MISMATCH.to_owned(),
    })
}

/// A digest as lowercase hex, for the log line a mismatch writes.
fn to_hex(digest: &Sha256Digest) -> String {
    use std::fmt::Write as _;

    digest
        .iter()
        .fold(String::with_capacity(64), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The first lines of a real `SHA2-256SUMS`, from the release current on
    /// 2026-09-28, verbatim.
    const REAL_SUMS: &str = "\
1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6  yt-dlp
66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a  yt-dlp.exe
072aad4f2a7604e92155f61a275a4752dc64046c8f6d90df3710525d94cd37c1  yt-dlp.tar.gz
58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a  yt-dlp_linux
0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202  yt-dlp_macos
07e54b0865303c864006925913bce2604f8ee8cc6f18699bac9c309f9328a6d8  yt-dlp_macos.zip
";

    /// The SHA-256 of the three bytes `abc`, from FIPS 180-2's test vectors.
    const ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    #[test]
    fn finds_each_platforms_asset_in_a_real_sums_file() {
        let mac = parse_sums(REAL_SUMS, "yt-dlp_macos").expect("listed");
        assert_eq!(
            to_hex(&mac),
            "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202"
        );

        let windows = parse_sums(REAL_SUMS, "yt-dlp.exe").expect("listed");
        assert_eq!(
            to_hex(&windows),
            "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a"
        );
    }

    #[test]
    fn a_name_that_is_a_prefix_of_another_does_not_match_it() {
        // `yt-dlp_macos` must not answer for `yt-dlp_macos.zip`, nor `yt-dlp`
        // for `yt-dlp.exe`: the lookup is by whole name.
        let zip = parse_sums(REAL_SUMS, "yt-dlp_macos.zip").expect("listed");
        let bare = parse_sums(REAL_SUMS, "yt-dlp_macos").expect("listed");
        assert_ne!(zip, bare);
        assert_eq!(
            to_hex(&parse_sums(REAL_SUMS, "yt-dlp").expect("listed")),
            "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6"
        );
    }

    #[test]
    fn an_unlisted_asset_has_no_digest() {
        assert_eq!(parse_sums(REAL_SUMS, "yt-dlp_haiku"), None);
        assert_eq!(parse_sums("", "yt-dlp"), None);
    }

    #[test]
    fn binary_mode_markers_and_junk_lines_are_tolerated() {
        let document = format!("# a comment\n\nnot-a-digest  yt-dlp\n{ABC} *yt-dlp\n");
        assert_eq!(
            to_hex(&parse_sums(&document, "yt-dlp").expect("the starred line")),
            ABC
        );
    }

    #[test]
    fn a_digest_of_the_wrong_length_or_alphabet_is_refused() {
        assert_eq!(parse_hex(&ABC[..63]), None);
        assert_eq!(parse_hex(&format!("{}g", &ABC[..63])), None);
        assert_eq!(
            parse_hex(&ABC.to_uppercase()).map(|digest| to_hex(&digest)),
            Some(ABC.to_owned()),
            "upper-case hex is still hex"
        );
    }

    #[test]
    fn gyan_devs_bare_digest_parses_with_or_without_a_newline() {
        let real = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
        assert_eq!(to_hex(&parse_bare(real).expect("parses")), real);
        assert_eq!(
            to_hex(&parse_bare(&format!("{real}\n")).expect("parses")),
            real
        );
        assert_eq!(parse_bare("<html>503 Service Unavailable</html>"), None);
        assert_eq!(parse_bare(""), None);
    }

    #[tokio::test]
    async fn a_file_is_hashed_with_sha256() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("abc");
        tokio::fs::write(&path, b"abc").await.expect("write");

        assert_eq!(to_hex(&digest_file(&path).await.expect("hashes")), ABC);
    }

    #[tokio::test]
    async fn a_matching_file_verifies() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("abc");
        tokio::fs::write(&path, b"abc").await.expect("write");

        verify_file(&path, &parse_hex(ABC).expect("a digest"))
            .await
            .expect("the digest matches");
    }

    #[tokio::test]
    async fn a_mismatched_file_is_refused_with_the_mismatch_message() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("abc");
        tokio::fs::write(&path, b"abd").await.expect("write");

        let error = verify_file(&path, &parse_hex(ABC).expect("a digest"))
            .await
            .expect_err("one byte off must not verify");

        assert_eq!(error.to_string(), CHECKSUM_MISMATCH);
    }
}
