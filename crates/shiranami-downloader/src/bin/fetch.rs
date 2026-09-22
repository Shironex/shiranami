//! Streaming a release asset to disk, with progress.
//!
//! v1 used `electron.net.request`, which followed redirects and read system
//! proxy settings for free. `shiranami-net` gives us the proxy settings; the
//! redirects we drive ourselves, because the only redirect-less primitive net
//! exposes is [`HttpClient::stream`] and that is deliberate — following
//! redirects inside the client is what stops a caller re-checking each hop.
//!
//! All three download hosts redirect. GitHub sends release assets to
//! `objects.githubusercontent.com`, and both ffmpeg hosts front their archives
//! with a redirect to a CDN.
//!
//! # Why the response body is streamed rather than buffered
//!
//! [`HttpClient::bytes`] would be one line. It would also hold a 150 MB ffmpeg
//! archive in memory to write it to a file it is about to read back — on the
//! machines most likely to be installing ffmpeg for the first time.
//!
//! # Why the SSRF guard is not applied here
//!
//! Every URL this module fetches is a compile-time constant naming a host we
//! already trust to hand us a binary we are about to execute. The guard exists
//! for URLs that arrive from the renderer, a playlist or an upstream response —
//! v1 applied it at exactly two such call sites, and this is not one of them.
//! Turning it on would also resolve each hostname a second time and refuse a
//! private address, which is precisely the setup of a corporate mirror behind
//! the system proxy that `shiranami-net` is configured to keep working.

use std::path::Path;

use shiranami_net::{HttpClient, RequestOptions};
use tokio::io::AsyncWriteExt;

use crate::error::{DownloaderError, Result};

/// How many redirects to follow before giving up.
///
/// The same ceiling `shiranami-serve` uses for the radio proxy. Three hops is
/// the most any of these hosts has ever needed; five leaves room without
/// letting a redirect loop run forever.
pub const MAX_REDIRECTS: usize = 5;

/// Notified as a download progresses, with a whole percentage.
pub trait ProgressSink: Send + Sync {
    /// Progress, 0–100.
    fn percent(&self, percent: u32);
}

impl<F> ProgressSink for F
where
    F: Fn(u32) + Send + Sync,
{
    fn percent(&self, percent: u32) {
        self(percent);
    }
}

/// A sink that rescales another sink's 0–100 onto a sub-range.
///
/// The ffmpeg install reports one overall percentage across two downloads and
/// two extractions, so each stage needs its own slice of the bar. v1 did this
/// with inline arithmetic at four call sites; one adapter is one place for the
/// rounding to be right.
pub struct Scaled<'a> {
    inner: &'a dyn ProgressSink,
    offset: u32,
    span: f64,
}

impl<'a> Scaled<'a> {
    /// Map `inner`'s 0–100 onto `offset..=offset + span`.
    pub fn new(inner: &'a dyn ProgressSink, offset: u32, span: f64) -> Self {
        Self {
            inner,
            offset,
            span,
        }
    }
}

impl ProgressSink for Scaled<'_> {
    fn percent(&self, percent: u32) {
        // v1's `Math.round(pct * 0.45)` and `50 + Math.round(pct * 0.45)`.
        // `f64::round` and `Math.round` agree on every non-negative half-way
        // case, which is all this ever sees.
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the product of a 0..=100 input and a span below 100 \
                      cannot leave u32 range"
        )]
        let scaled = (f64::from(percent) * self.span / 100.0).round() as u32;
        self.inner.percent(self.offset + scaled);
    }
}

/// Download `url` to `destination`, reporting progress when the length is known.
///
/// Redirects are followed up to [`MAX_REDIRECTS`] hops. The destination is
/// written as the bytes arrive; the caller is responsible for writing to a
/// temporary path and renaming, which is what makes a failed download leave no
/// half-written binary behind.
///
/// # Errors
///
/// [`DownloaderError::Http`] for a transport failure or a non-2xx status,
/// [`DownloaderError::Io`] if the destination cannot be written.
pub async fn download_to_file(
    client: &HttpClient,
    url: &str,
    destination: &Path,
    progress: Option<&dyn ProgressSink>,
) -> Result<()> {
    let mut response = follow(client, url).await?;

    let total = response
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|length| *length > 0);

    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|source| DownloaderError::Io {
            operation: "create the download destination",
            path: destination.to_path_buf(),
            source,
        })?;

    let mut downloaded: u64 = 0;
    // v1 fired the callback on every chunk, which for a 150 MB archive read in
    // 8 KiB pieces is roughly 19,000 calls to deliver 101 distinct values. Only
    // changes are reported here: the same sequence of values, in the same
    // order, without the flood (R24).
    let mut last_reported: Option<u32> = None;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|source| DownloaderError::Http {
            operation: "read the download body",
            source,
        })?
    {
        file.write_all(&chunk)
            .await
            .map_err(|source| DownloaderError::Io {
                operation: "write the download",
                path: destination.to_path_buf(),
                source,
            })?;

        downloaded += chunk.len() as u64;

        if let (Some(progress), Some(total)) = (progress, total) {
            let percent = percent_of(downloaded, total);
            if last_reported != Some(percent) {
                last_reported = Some(percent);
                progress.percent(percent);
            }
        }
    }

    file.flush().await.map_err(|source| DownloaderError::Io {
        operation: "flush the download",
        path: destination.to_path_buf(),
        source,
    })?;

    Ok(())
}

/// v1's `Math.min(100, Math.round(downloaded / contentLength * 100))`.
///
/// The clamp matters: a server whose `Content-Length` understates the body — a
/// gzip-transfer-encoded response measured after decoding, say — would
/// otherwise report 143%.
fn percent_of(downloaded: u64, total: u64) -> u32 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "a byte count large enough to lose f64 precision is a download \
                  of several petabytes"
    )]
    let ratio = downloaded as f64 / total as f64;
    #[expect(
        clippy::cast_possible_truncation,
        reason = "clamped to 0..=100 immediately below"
    )]
    let percent = (ratio * 100.0).round() as i64;
    percent.clamp(0, 100) as u32
}

/// Walk the redirect chain and return the response that carries the body.
async fn follow(client: &HttpClient, url: &str) -> Result<shiranami_net::StreamedResponse> {
    let mut current = url.to_owned();

    for _hop in 0..=MAX_REDIRECTS {
        let response = client
            .stream(&current, RequestOptions::default())
            .await
            .map_err(|source| DownloaderError::Http {
                operation: "request the download",
                source,
            })?;

        let status = response.status();

        if status.is_redirection()
            && let Some(location) = response.location()
        {
            let next = resolve(&current, location)?;
            tracing::debug!(from = %current, to = %next, "download redirected");
            current = next;
            continue;
        }

        // v1's check, verbatim: anything outside 2xx is a failure, including a
        // 3xx with no `Location` to follow. The message is v1's too, because
        // the install handlers put a failure's message straight onto the
        // `downloader.install_failed` payload the renderer displays.
        if !status.is_success() {
            return Err(DownloaderError::InstallFailed {
                message: format!("Download failed with status {}", status.as_u16()),
            });
        }

        return Ok(response);
    }

    Err(DownloaderError::InstallFailed {
        message: format!("download redirected more than {MAX_REDIRECTS} times"),
    })
}

/// Resolve a `Location` value, which may be relative, against the URL it came
/// from.
fn resolve(base: &str, location: &str) -> Result<String> {
    let base = url::Url::parse(base).map_err(|_| DownloaderError::InstallFailed {
        message: format!("could not parse the download URL: {base}"),
    })?;

    base.join(location)
        .map(String::from)
        .map_err(|_| DownloaderError::InstallFailed {
            message: format!("could not follow the download redirect to {location}"),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Recorder {
        seen: Mutex<Vec<u32>>,
    }

    impl Recorder {
        fn seen(&self) -> Vec<u32> {
            self.seen
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }
    }

    impl ProgressSink for Recorder {
        fn percent(&self, percent: u32) {
            self.seen
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(percent);
        }
    }

    #[test]
    fn progress_is_a_rounded_clamped_percentage() {
        assert_eq!(percent_of(0, 100), 0);
        assert_eq!(percent_of(50, 100), 50);
        assert_eq!(percent_of(100, 100), 100);
        assert_eq!(percent_of(1, 3), 33);
        assert_eq!(percent_of(2, 3), 67);
        assert_eq!(
            percent_of(150, 100),
            100,
            "a body longer than its announced length must not report 150%"
        );
    }

    #[test]
    fn the_scaling_adapter_reproduces_v1s_two_ffmpeg_ranges() {
        let recorder = Recorder::default();

        // The ffmpeg half: `Math.round(pct * 0.45)`.
        let first = Scaled::new(&recorder, 0, 45.0);
        first.percent(50);
        first.percent(100);

        // The ffprobe half: `50 + Math.round(pct * 0.45)`.
        let second = Scaled::new(&recorder, 50, 45.0);
        second.percent(50);
        second.percent(100);

        assert_eq!(
            recorder.seen(),
            vec![23, 45, 73, 95],
            "these are the exact values v1's ffmpeg-manager test observed for a \
             download reporting 50 then 100"
        );
    }

    #[test]
    fn a_relative_redirect_resolves_against_the_url_it_came_from() {
        assert_eq!(
            resolve("https://example.com/a/b", "/c/d").expect("resolves"),
            "https://example.com/c/d"
        );
        assert_eq!(
            resolve("https://example.com/a/b", "https://cdn.example.net/x").expect("resolves"),
            "https://cdn.example.net/x"
        );
    }
}
