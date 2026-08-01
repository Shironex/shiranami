//! Native OS media integration, because the webview's cannot be used.
//!
//! `shiranami-media-controls` owns `souvlaki`-backed SMTC on Windows and
//! `MPNowPlayingInfoCenter` on macOS, plus the remote-command handlers that
//! make hardware media keys work. `navigator.mediaSession` is not an option:
//! an embedded WKWebView never bridges it to macOS at all, and on Windows it
//! renders the app as "Microsoft Edge WebView2" (WebView2Feedback#2236,
//! unresolved since 2022). The webview session is therefore suppressed and
//! this crate is the only publisher of now-playing state to the OS.
//!
//! Ported in Phase 13; exactly one OS entry must appear. See
//! `docs/v2/architecture.md` §2.7.
