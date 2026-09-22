//! The three lookups that are not a queue and not a playlist.
//!
//! Search, autocomplete suggestions, and resolving a direct stream URL for
//! preview playback.
//!
//! # Suggestions come from Google's endpoint, not from yt-dlp
//!
//! `clients1.google.com/complete/search?client=firefox&ds=yt` answers in
//! milliseconds; a yt-dlp search takes seconds and spawns a process. For a
//! search box that queries on every keystroke, that is the whole difference.
//!
//! It also has no error path worth surfacing: v1 registered it with a fallback
//! that returned an empty list on any failure, because a search box that shows
//! no suggestions is working normally and a search box that shows an error
//! toast per keystroke is not. That behaviour is kept here rather than left to
//! the command layer, since it is a property of the operation.

use shiranami_core::models::SearchResult;
use shiranami_net::{HttpClient, RequestOptions};
use tokio_util::sync::CancellationToken;

use crate::error::{DownloaderError, Result};
use crate::extract::parse_json_lines;
use crate::spawn::{ProcessRunner, ProcessSpec, args, classify};

/// Results per search. v1's value.
pub const SEARCH_LIMIT: u32 = 10;

/// Cap on the suggestion response, which is a short JSON array.
///
/// Anything larger is not the endpoint we asked, and buffering it would be the
/// only unbounded read on a path that runs per keystroke.
const SUGGEST_MAX_BYTES: u64 = 64 * 1024;

/// Searches YouTube and resolves stream URLs.
pub struct SearchService {
    processes: std::sync::Arc<dyn ProcessRunner>,
    client: std::sync::Arc<HttpClient>,
    yt_dlp_path: std::path::PathBuf,
}

impl SearchService {
    /// A service over `yt_dlp_path`.
    pub fn new(
        processes: std::sync::Arc<dyn ProcessRunner>,
        client: std::sync::Arc<HttpClient>,
        yt_dlp_path: std::path::PathBuf,
    ) -> Self {
        Self {
            processes,
            client,
            yt_dlp_path,
        }
    }

    /// Search YouTube for `query`.
    ///
    /// # Errors
    ///
    /// [`DownloaderError::YtDlp`] when yt-dlp exits non-zero, or
    /// [`DownloaderError::Process`] when it cannot be run.
    pub async fn search(
        &self,
        query: &str,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchResult>> {
        let spec =
            ProcessSpec::capturing(self.yt_dlp_path.clone(), args::search(query, SEARCH_LIMIT));

        let output = self
            .processes
            .run(spec, None, cancel)
            .await
            .map_err(|source| DownloaderError::Process {
                operation: "search YouTube",
                source,
            })?;

        if output.code != 0 {
            return Err(DownloaderError::YtDlp {
                code: classify::classify_failure(&format!("{}\n{}", output.stdout, output.stderr)),
            });
        }

        Ok(parse_json_lines(&output.stdout))
    }

    /// Autocomplete suggestions for `query`.
    ///
    /// Never fails: any error yields an empty list, which is what v1's
    /// fallback-registered handler did and what a search box wants.
    pub async fn suggest(&self, query: &str) -> Vec<String> {
        let url = format!(
            "https://clients1.google.com/complete/search?client=firefox&ds=yt&q={}",
            urlencode(query)
        );

        let options = RequestOptions::default().with_max_bytes(SUGGEST_MAX_BYTES);

        // The endpoint answers `["query", ["suggestion", …], …]`; only the
        // second element is ever read.
        match self.client.json::<serde_json::Value>(&url, options).await {
            Ok(value) => value
                .get(1)
                .and_then(serde_json::Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default(),
            Err(error) => {
                tracing::debug!(%error, "could not fetch search suggestions");
                Vec::new()
            }
        }
    }

    /// Resolve a direct audio stream URL for `url`.
    ///
    /// # Errors
    ///
    /// [`DownloaderError::InvalidUrl`] when `url` is not http(s),
    /// [`DownloaderError::YtDlp`] when extraction fails, and
    /// [`DownloaderError::NoStreamUrl`] when it succeeds but prints nothing.
    pub async fn stream_url(&self, url: &str, cancel: &CancellationToken) -> Result<String> {
        // Refuses a non-http(s) URL, and inserts `--`.
        let argv = args::stream_url(url)?;
        let spec = ProcessSpec::capturing(self.yt_dlp_path.clone(), argv);

        let output = self
            .processes
            .run(spec, None, cancel)
            .await
            .map_err(|source| DownloaderError::Process {
                operation: "resolve a stream URL",
                source,
            })?;

        if output.code != 0 {
            // v1 concatenated stderr before stdout here and stdout before
            // stderr elsewhere; a substring search does not care, and neither
            // does the tail it falls back to.
            let reason =
                classify::classify_failure(&format!("{}\n{}", output.stderr, output.stdout));
            tracing::error!(
                url,
                code = output.code,
                reason,
                "could not resolve a stream URL"
            );
            return Err(DownloaderError::YtDlp { code: reason });
        }

        // yt-dlp prints one URL per selected format; `-f bestaudio` selects
        // one, and the first line is it.
        output
            .stdout
            .trim()
            .split('\n')
            .next()
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .ok_or(DownloaderError::NoStreamUrl)
    }
}

/// Percent-encode a query for a URL query parameter.
///
/// Hand-rolled rather than pulling a crate for one call site. Encodes
/// everything outside the unreserved set, which is stricter than
/// `encodeURIComponent` — v1's function left `!'()*` alone, and encoding them
/// is equally valid and understood by the endpoint.
fn urlencode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());

    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char);
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }

    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_query_encodes_to_itself() {
        assert_eq!(urlencode("lofi"), "lofi");
        assert_eq!(urlencode("lofi-beats_2.0~x"), "lofi-beats_2.0~x");
    }

    #[test]
    fn spaces_and_separators_are_percent_encoded() {
        assert_eq!(urlencode("lofi beats"), "lofi%20beats");
        assert_eq!(urlencode("a&b=c"), "a%26b%3Dc");
        assert_eq!(
            urlencode("a?q=1#frag"),
            "a%3Fq%3D1%23frag",
            "an unencoded `#` would truncate the query at the fragment"
        );
    }

    #[test]
    fn non_ascii_encodes_as_utf8_bytes() {
        assert_eq!(urlencode("é"), "%C3%A9");
        assert_eq!(urlencode("東京"), "%E6%9D%B1%E4%BA%AC");
    }
}
