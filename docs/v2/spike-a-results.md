# Spike A results — macOS WKWebView Web Audio (shiranami v2 go/no-go gate)

**Date:** 2026-08-01
**Verdict line is at the bottom; short answer: everything passed.**

## Environment

| Item         | Value                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS        | 26.5.1 (build 25F80), Darwin 25.5.0, Apple Silicon (T8122)                                                                                                                                                    |
| WebKit       | AppleWebKit/605.1.15 (UA), system WebKit bundle 21624.2.5.11.4 (Safari 26.x line)                                                                                                                             |
| Tauri / wry  | tauri 2.11.5 (cargo, debug build), Rust 1.94.1                                                                                                                                                                |
| Page origin  | `tauri://localhost` (default frontendDist custom scheme)                                                                                                                                                      |
| Audio origin | `http://127.0.0.1:50420` (axum loopback, random port)                                                                                                                                                         |
| AudioContext | started `suspended`, `resume()` succeeded **without any user gesture** → `running`; sampleRate 48000, baseLatency 2.7 ms                                                                                      |
| Fixtures     | Rust-generated 440 Hz / 554.37 Hz sine WAVs; MP3 + FLAC encoded via ffmpeg 8.1 (`/opt/homebrew/bin/ffmpeg`; the Shiranami runtime-download dir did not exist on this machine)                                 |
| Test rig     | `scratchpad/spike-a/` — disposable Tauri v2 app, auto-runs matrix on load, reports via Tauri command, Rust writes `spike-a/spike-results.json` and exits. Fully non-interactive, exit code 0, ~20 s wall time |

The graph under test mirrors `apps/web/src/lib/audioAnalyser.ts` / `useAudioEngine.ts`: `new Audio()` + `preload='auto'` + `crossOrigin='anonymous'`, `createMediaElementSource` per deck, deck gains → mix → preamp → (10-biquad EQ: lowshelf / 8× peaking Q=1.414 / highshelf) → DynamicsCompressor limiter (−1 dB, ratio 20) → AnalyserNode → destination.

## Results against the proposal's A1–A7 criteria

| Criterion                                          | Result                          | Evidence                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 — audio plays through a deck                    | **PASS**                        | `play()` resolves with no user gesture; `currentTime` advances (0 → 1.4 s during sampling) for WAV, MP3, and FLAC                                                                                                                                                                                                |
| A2 — analyser sees energy                          | **PASS**                        | time-domain RMS 0.354 (theoretical for a 0.5-amp sine: 0.354); FFT peak at the 445.31 Hz bin (nearest 11.72 Hz-wide bin to 440) at −20.5 dB, next spectral content ≤ −93 dB                                                                                                                                      |
| A3 — strip ACAO → canary reads zero (anti-vacuity) | **PASS**                        | Two failure shapes confirmed, see below. With the header stripped the analyser reads exactly 0 RMS / −Inf all bins while `currentTime` still advances — the energy canary detects the failure                                                                                                                    |
| A4 — EQ band change measurable                     | **PASS**                        | 500 Hz peaking band ±12 dB moved the 440 Hz bin by **+10.31 / −10.31 dB** (≥6 dB required; ~10.3 is the textbook value for a Q=1.414 filter measured 60 Hz off-center) — through the full chain including the limiter                                                                                            |
| A5 — equal-power crossfade, no dip/clip            | **PASS**                        | 2 s cos/sin `setValueCurveAtTime` fade between decks (440 Hz → 554.37 Hz): max RMS excursion **0.10 dB** (±1 dB allowed); post-fade FFT peak sits on deck B's tone                                                                                                                                               |
| A6 — no gross MediaElementSource degradation       | **PASS** (within-WKWebView A/B) | Same bytes through `createMediaElementSource` vs `decodeAudioData`+`AudioBufferSourceNode`: fundamental delta **0.00 dB**, identical peak bin, harmonics ≤ −107 dB relative in both paths. No rolloff, no aliasing, no level shift. Cross-engine (vs Chromium) capture was out of scope for this rig — see notes |
| A7 — limiter + biquad coefficients behave          | **PASS** (partial)              | Biquad deltas are symmetric and match theory (A4); the DynamicsCompressor stayed transparent below threshold (deltas linear, no signal kill). Full fixture-level A/B against Chromium not run — no anomaly observed that would motivate it                                                                       |

**Proposal GO condition:** "A1–A5 pass and A6/A7 show no audible or spectral regression" — met.

## Per-test detail

### 1. CORS-correct route + `crossOrigin='anonymous'` (core condition)

PASS for **WAV, MP3, and FLAC**. All three: playback starts programmatically, `currentTime` advances, RMS 0.35, FFT peak at the 440 Hz bin. Compressed-codec paths behave identically to PCM (MP3 shows its expected slightly-higher noise skirt at −108 dB; irrelevant).

### 2. Missing-CORS route (two failure shapes, both safe)

- **2a. `crossOrigin='anonymous'` + no ACAO header:** the load **fails outright** — media element `error` event, `MediaError.code 4` (SRC*NOT_SUPPORTED). WKWebView treats the anonymous-mode fetch as a hard CORS failure. This is \_louder* than Chromium's behavior and trivially detectable.
- **2b. no `crossOrigin` attribute + no ACAO header:** the documented silent trap, confirmed on WKWebView: the element plays normally (`currentTime` advances) but the tainted `MediaElementSource` outputs **digital silence** — RMS exactly 0, every FFT bin at −Inf. Nothing reaches the analyser or the speakers.
- Consequence: the v2 axum stream server **must always send `Access-Control-Allow-Origin`** (`*` is sufficient for anonymous mode), and the app must keep `crossOrigin='anonymous'` on the deck elements so a header regression fails loudly (error event) instead of silently.

### 3. Seek / Range

PASS. Seek from 0.3 s → 50.01 s in a 60 s file completed (`seeked` fired, `currentTime` 50.01), samples kept flowing (RMS 0.35 after the jump, peak still at 440).
Server-side log: WKWebView **always** speaks Range for media — every media load opened with a `Range: bytes=0-1` probe followed by a full-span request (`bytes=0-<len-1>`), all answered 206. No mid-file range was observed for the seek itself because the whole 10.6 MB file was already buffered over loopback before the seek fired; on loopback that is the expected steady state. The requirement stands regardless: **the stream server must implement RFC-7233 single-range requests and reply 206 with `Content-Range` + `Accept-Ranges`** — WebKit's two-byte probe means a server that ignores Range would misbehave on first load, not just on seek.

### 4. Fidelity sanity

PASS. Element-source path vs `decodeAudioData` path on the same bytes: fundamental 0.00 dB apart, same peak bin, harmonic/noise floor ≤ −107 dB relative in both. `createMediaElementSource` on this WebKit is audio-transparent. (Note: WKWebView runs the context at 48 kHz and resamples the 44.1 kHz fixtures; transparent in the spectra.)

### 5. Two-deck crossfade + mediaSession

PASS. Two simultaneous `Audio` elements on one AudioContext (the real app's deck pattern) play concurrently; equal-power cos/sin gain curves over 2 s held the summed RMS within **0.10 dB** of the pre-fade level (34 samples, worst |excursion| 0.10 dB), and the spectrum handed off cleanly from 440 Hz to 554 Hz. No dips, clips, or zipper artifacts in the series.

`navigator.mediaSession`: present in WKWebView; `MediaMetadata`, all action handlers (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`), and `playbackState` all accepted without error. **Caveat:** API acceptance was verified programmatically; whether WKWebView actually surfaces Now Playing / media-key integration to macOS the way Safari does could not be asserted non-interactively. Plan for a quick manual check during Phase 1, and keep the existing native fallback option (Tauri/objc media-key handling) on the shelf if it turns out inert.

### 6. Environment / scheme notes

- `sw_vers`: macOS 26.5.1 (25F80). UA: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)` (frozen UA string; real WebKit is the Safari 26.x system build 21624.2.5.11.4).
- **wry#1778 (macOS 26.6 custom-scheme regression):** not applicable here twice over — this machine is on 26.5.1, and the audio path is loopback HTTP by design. The UI page itself _was_ served over the default `tauri://localhost` custom scheme and loaded fine; nothing scheme-related was observed. Since the regression targets custom-scheme responses on 26.6, the v2 decision to keep all media on `http://127.0.0.1` stands as the correct insulation; consider also serving the UI over loopback (or pinning wry with the fix) before 26.6 ships to users.
- CORS `Origin` sent by the webview is the literal string `tauri://localhost`. `Access-Control-Allow-Origin: *` matches it (anonymous mode, no credentials). If the stream server ever needs credentialed requests, it must echo `tauri://localhost` explicitly — `*` would stop working.

## Autoplay / non-interactive playback

No configuration was needed at all: wry's default WKWebView setup (`mediaTypesRequiringUserActionForPlayback = []`, i.e. wry's `autoplay: true` default) let `HTMLAudioElement.play()` and `AudioContext.resume()` succeed with zero user gestures. The `AudioContext` does start `suspended` — a bare `resume()` (no gesture) flips it to `running`, matching what `initAnalyser`/`resumeAudioContext` already do.
Electron equivalent for the findings ledger: Chromium needs `app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` (or a user gesture); WKWebView under Tauri needs nothing, but **do not disable** wry's autoplay default.

## What this changes in the v2 plan

1. **The gate is open** — proceed to Phase 1. No native-Rust-playback fallback spike needed.
2. **Stream-server hard requirements** (encode as tests): `Access-Control-Allow-Origin: *` on every media response; full single-range RFC-7233 support (WebKit sends a `bytes=0-1` probe on every load and expects 206 + `Content-Range` + `Accept-Ranges`); correct `Content-Type` per container.
3. Keep `crossOrigin='anonymous'` on deck elements — on WKWebView it converts the silent-failure mode into a loud element error, which the permanent analyser-energy E2E test then never has to catch.
4. Keep the analyser-energy E2E canary anyway (R2 mitigation) — proven non-vacuous on this engine by test 2b.
5. mediaSession: API fully accepted; schedule a 5-minute manual Now Playing / media-key check in Phase 1 before wiring UI around it.
6. WKWebView contexts run at 48 kHz (44.1 kHz media is resampled transparently) — irrelevant to playback, but LUFS/analysis code that assumes the context rate equals the file rate should keep reading `ctx.sampleRate`.
7. wry#1778: our loopback-HTTP media path is immune by construction; re-verify UI-over-custom-scheme once a macOS 26.6 machine is available or pin a fixed wry.

## Artifacts

- Raw data: `scratchpad/spike-a/spike-results.json` (includes full per-request Range log and every measurement)
- Rig: `scratchpad/spike-a/` (`src-tauri/src/main.rs` = fixtures + axum server + commands; `ui/index.html` = auto-run matrix). Disposable; delete freely.

---

**VERDICT: PASS** — GO for the v2 port. A1–A5 pass outright; A6/A7 show no spectral or behavioral regression (cross-engine A/B against Chromium left as an optional Phase-1 nicety; nothing here motivates it).
