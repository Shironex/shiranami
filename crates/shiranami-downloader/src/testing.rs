//! Test-only helpers shared across this crate's modules.
//!
//! `CARGO_MANIFEST_DIR` appears here and nowhere else. Architecture §2.3 forbids
//! it as a *runtime* path — it names the machine that built the binary, which is
//! how a CI-built release once shipped broken. In a `cfg(test)` module the build
//! machine and the running machine are the same machine, which is precisely what
//! makes the mirror tests possible at all.

use std::path::PathBuf;

/// Absolute path to a repo file, resolved from the crate manifest.
fn repo_path(relative: &str) -> PathBuf {
    std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .join(relative)
        .canonicalize()
        .unwrap_or_else(|error| panic!("resolve {relative} from the repo root: {error}"))
}

/// Read a repo file, for the tests that compare a Rust constant against the
/// TypeScript literal it mirrors.
pub(crate) fn repo_file(relative: &str) -> String {
    let path = repo_path(relative);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}
