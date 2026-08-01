//! TypeScript binding export and the guards that keep it honest.

/// Absolute path to a repo file, resolved from a compile-time constant.
#[cfg(test)]
pub(crate) fn repo_path(relative: &str) -> std::path::PathBuf {
    std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .join(relative)
        .canonicalize()
        .unwrap_or_else(|e| panic!("resolve {relative} from the repo root: {e}"))
}

/// Read a repo file to a string, for the mirror tests that compare a Rust
/// constant against the TypeScript literal it mirrors.
#[cfg(test)]
pub(crate) fn repo_file(relative: &str) -> String {
    let path = repo_path(relative);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}
