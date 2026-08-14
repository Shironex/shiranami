//! The Rust half of the analyser-energy regression test (architecture §8, R2).
//!
//! Spike A's silent-failure mode is the reason this file exists. A media element
//! pointed at a cross-origin response with no `Access-Control-Allow-Origin`
//! still *plays* — `currentTime` advances, no error fires — but the
//! `MediaElementAudioSourceNode` built from it is tainted and emits digital
//! silence. Nothing reaches the analyser and nothing reaches the speakers. No
//! unit test sees it, because every unit test in this crate asserts on a
//! `reqwest` response rather than on what a webview's audio graph does with one.
//!
//! So this example boots the **real** router — the same
//! [`shiranami_serve::server::router`] the app runs, over a real
//! [`shiranami_serve::state::ServeState`] with a real session token — and prints
//! the URLs a browser driver needs. `scripts/analyser-canary.mjs` drives a
//! browser at those URLs, plays the tone, and asserts the analyser sees it.
//!
//! # Two servers, one state
//!
//! The second server is the anti-vacuity control, and it is the point of the
//! whole arrangement. It mounts the *same* router over the *same* state and
//! wraps one extra layer around it that deletes `Access-Control-Allow-Origin` on
//! the way out. Same routes, same bytes, same token — one header apart.
//!
//! That gives the driver a differential rather than an assertion:
//!
//! - the guarded server **must** produce energy, so deleting the CORS layer
//!   from `cors.rs` fails the test;
//! - the stripped server **must** produce silence (no `crossOrigin`) or a load
//!   error (`crossOrigin='anonymous'`), so an assertion that has quietly become
//!   unfalsifiable — a browser that stopped playing, a probe that reads a
//!   disconnected analyser, a fixture of digital silence — fails it too.
//!
//! A canary that cannot die is not a canary. This is the same discipline D7
//! applies to the contract-drift guard, whose `--prove` mode exists because
//! nightcore's equivalent was vacuous for its entire life (R17).
//!
//! # Running it
//!
//! ```text
//! cargo run -p shiranami-serve --example analyser_canary
//! ```
//!
//! It prints one line of JSON and then serves until stdin closes, which is how
//! the driver stops it. Nothing here is test-only scaffolding inside the shipped
//! crate: an example is not compiled into the library, and `--all-targets`
//! already lints it.

use std::fmt::Write as _;
use std::io::{BufRead as _, Write as _};
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::Request;
use axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN;
use axum::middleware::Next;
use axum::response::Response;
use shiranami_core::paths::FoldersCache;
use shiranami_core::paths::authority::{PathAuthority, PathAuthorityResult};
use shiranami_net::url_safety::UrlGuard;
use shiranami_serve::state::{ServeConfig, ServeState};
use shiranami_serve::token::SessionToken;
use shiranami_serve::upstream::{FetchFuture, RadioUpstream, UpstreamError};
use tokio::net::TcpListener;

/// The fixture's sample rate. 44.1 kHz on purpose: WKWebView runs its
/// `AudioContext` at 48 kHz and resamples (Spike A §6), so a fixture that
/// matched the context rate would hide a resampler regression rather than
/// exercise it.
const SAMPLE_RATE: u32 = 44_100;

/// The tone. Same 440 Hz Spike A measured, so the numbers in
/// `docs/v2/spike-a-results.md` remain the reference for what "passing" looks
/// like.
const TONE_HZ: f64 = 440.0;

/// Peak amplitude. A full-scale sine would clip the limiter in the app's real
/// graph; 0.5 puts the theoretical RMS at 0.354, which is the figure Spike A
/// reported and the driver's floor is derived from.
const AMPLITUDE: f64 = 0.5;

/// Fixture length. The driver loops the element, so this only has to be long
/// enough that a Range-probing engine has something to stream.
const SECONDS: u32 = 10;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Not a `tempfile::TempDir`: the driver kills this process rather than
    // letting it unwind, so a `Drop`-based cleanup would not run anyway. A
    // named directory under the system temp root is cleaned on the way in,
    // which also makes a stale fixture from a crashed run impossible to reuse.
    let fixture_dir = std::env::temp_dir().join("shiranami-analyser-canary");
    let _ = std::fs::remove_dir_all(&fixture_dir);
    std::fs::create_dir_all(&fixture_dir)?;

    let fixture = fixture_dir.join("tone-440.wav");
    std::fs::write(&fixture, sine_wav())?;

    let state = ServeState::new(
        ServeConfig {
            folders: Arc::new(FoldersCache::new(
                fixture_dir.clone(),
                Arc::new(FixtureAuthority {
                    root: fixture_dir.clone(),
                }),
            )),
            art_dir: fixture_dir.clone(),
            background_dir: fixture_dir.clone(),
            guard: UrlGuard::system(),
            upstream: Arc::new(NoRadio),
            now_playing: shiranami_serve::NowPlayingSink::discarding(),
        },
        SessionToken::generate(),
    );

    // The router the app runs, unmodified.
    let guarded = serve(shiranami_serve::server::router(state.clone())).await?;
    // The same router, one header poorer. See the module note.
    let stripped = serve(
        shiranami_serve::server::router(state.clone())
            .layer(axum::middleware::from_fn(strip_allow_origin)),
    )
    .await?;

    let token = state.token().as_str();
    let mut stdout = std::io::stdout();
    writeln!(
        stdout,
        "{}",
        report(
            &audio_url(guarded, token, &fixture),
            &audio_url(stripped, token, &fixture),
        )
    )?;
    stdout.flush()?;

    // The driver stops us by closing our stdin (and then killing us). Waiting on
    // EOF rather than on a signal means an orphaned harness dies with the
    // terminal that started it instead of holding two loopback ports forever.
    tokio::task::spawn_blocking(|| {
        let mut sink = String::new();
        while std::io::stdin().lock().read_line(&mut sink).unwrap_or(0) > 0 {
            sink.clear();
        }
    })
    .await?;

    Ok(())
}

/// Bind an ephemeral loopback port and start serving `router` on it.
async fn serve(router: axum::Router) -> Result<u16, std::io::Error> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let port = listener.local_addr()?.port();

    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    Ok(port)
}

/// The anti-vacuity layer: delete the one header the whole test is about.
///
/// Applied *outside* [`shiranami_serve::server::router`], so it runs after
/// `cors::apply` on the response path and removes what that layer inserted. The
/// routes, the state, the token and the bytes are all the real ones.
async fn strip_allow_origin(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().remove(ACCESS_CONTROL_ALLOW_ORIGIN);
    response
}

/// A ready-to-fetch audio URL for `port`, encoded the way the renderer's
/// `toStreamUrl` encodes one.
fn audio_url(port: u16, token: &str, fixture: &Path) -> String {
    let path: String =
        url::form_urlencoded::byte_serialize(fixture.to_string_lossy().as_bytes()).collect();
    format!("http://127.0.0.1:{port}/{token}/audio?path={path}")
}

/// The handshake line, as JSON.
///
/// Hand-formatted rather than `serde_json`-serialized so this example adds no
/// dependency to the crate: every value below is either a number or a
/// percent-encoded ASCII URL, so there is nothing here that needs escaping.
fn report(guarded: &str, stripped: &str) -> String {
    let mut json = String::from("{");
    let _ = write!(json, "\"guardedAudioUrl\":\"{guarded}\",");
    let _ = write!(json, "\"strippedAudioUrl\":\"{stripped}\",");
    let _ = write!(json, "\"toneHz\":{TONE_HZ},");
    let _ = write!(json, "\"amplitude\":{AMPLITUDE},");
    let _ = write!(json, "\"sampleRate\":{SAMPLE_RATE},");
    let _ = write!(json, "\"durationSeconds\":{SECONDS}");
    json.push('}');
    json
}

/// A mono 16-bit PCM WAV of a full-period sine at [`TONE_HZ`].
///
/// Generated rather than committed: a binary fixture would need regenerating
/// whenever the tone changes, and `ffmpeg` is not something CI should need for a
/// sine wave. The length is rounded down to a whole number of periods so the
/// loop point is continuous and the spectrum has no seam in it.
fn sine_wav() -> Vec<u8> {
    let period = f64::from(SAMPLE_RATE) / TONE_HZ;
    let periods = (f64::from(SECONDS) * TONE_HZ).floor();
    let frames = (periods * period) as u32;
    let data_len = frames * 2;

    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // PCM header size
    wav.extend_from_slice(&1u16.to_le_bytes()); // format: PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // channels: mono
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // byte rate
    wav.extend_from_slice(&2u16.to_le_bytes()); // block align
    wav.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());

    for frame in 0..frames {
        let phase = std::f64::consts::TAU * TONE_HZ * f64::from(frame) / f64::from(SAMPLE_RATE);
        let sample = (phase.sin() * AMPLITUDE * f64::from(i16::MAX)) as i16;
        wav.extend_from_slice(&sample.to_le_bytes());
    }

    wav
}

/// The database seam, answering for a directory holding one generated fixture.
struct FixtureAuthority {
    root: PathBuf,
}

impl PathAuthority for FixtureAuthority {
    fn download_location(&self) -> PathBuf {
        self.root.join("downloads")
    }

    fn folder_roots(&self) -> PathAuthorityResult<Vec<PathBuf>> {
        Ok(vec![self.root.clone()])
    }

    fn has_track_at(&self, _path: &Path) -> PathAuthorityResult<bool> {
        Ok(false)
    }
}

/// The radio route is not part of this test, and a harness that could reach the
/// network would be a harness that could hang on it.
struct NoRadio;

impl RadioUpstream for NoRadio {
    fn fetch<'a>(&'a self, _url: &'a str) -> FetchFuture<'a> {
        Box::pin(async { Err(UpstreamError::Transport) })
    }
}
