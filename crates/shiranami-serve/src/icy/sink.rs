//! Where a de-framed `StreamTitle` goes, and why that is a callback.
//!
//! This crate binds a socket. It has no `AppHandle`, no event bus and no
//! opinion about how a renderer learns anything — that is `src-tauri`'s job,
//! and §2.1's rule is that the crates never reach for the composition root.
//!
//! So the proxy is handed somewhere to put titles, in exactly the shape
//! `shiranami_media_controls::CommandSink` uses for the mirror-image problem
//! (an OS button that has to reach the renderer). A callback rather than a
//! channel because the shell may want to do something other than enqueue: emit
//! a Tauri event, log it in a browser-only build, or — the default here — drop
//! it, so a caller that does not care about now-playing pays nothing and needs
//! no wiring.

use std::fmt;
use std::sync::Arc;

use shiranami_core::models::RadioNowPlaying;

/// Where the radio proxy reports each new `StreamTitle`.
///
/// Cheap to clone, and cloned per request: the proxy hands one to every
/// de-framed body it starts.
#[derive(Clone)]
pub struct NowPlayingSink(Arc<dyn Fn(RadioNowPlaying) + Send + Sync>);

impl NowPlayingSink {
    /// Deliver titles to `handler`.
    ///
    /// The handler runs on the task polling the station's body, so it must not
    /// block — the audio the listener is hearing is behind it in the same
    /// stream. Emitting an event or sending on an unbounded channel is the
    /// intended shape; a database write is not.
    #[must_use]
    pub fn from_fn<F>(handler: F) -> Self
    where
        F: Fn(RadioNowPlaying) + Send + Sync + 'static,
    {
        Self(Arc::new(handler))
    }

    /// Discard every title.
    ///
    /// The default, and what the tests and any embedder without a renderer use.
    /// Deliberately not an `Option<NowPlayingSink>` in the config: an absent
    /// sink and a sink that drops behave identically, and one of the two spares
    /// every call site an unwrap.
    #[must_use]
    pub fn discarding() -> Self {
        Self::from_fn(|_| {})
    }

    /// Report one title.
    pub fn send(&self, playing: RadioNowPlaying) {
        (self.0)(playing);
    }
}

impl Default for NowPlayingSink {
    fn default() -> Self {
        Self::discarding()
    }
}

impl fmt::Debug for NowPlayingSink {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("NowPlayingSink")
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[test]
    fn a_sink_delivers_to_its_handler() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let recorder = Arc::clone(&seen);
        let sink = NowPlayingSink::from_fn(move |playing| {
            recorder.lock().expect("not poisoned").push(playing.raw);
        });

        sink.send(RadioNowPlaying::new("http://s/live", "A - B"));
        sink.clone()
            .send(RadioNowPlaying::new("http://s/live", "C - D"));

        let seen = seen.lock().expect("not poisoned");
        assert_eq!(*seen, vec!["A - B".to_owned(), "C - D".to_owned()]);
    }

    #[test]
    fn the_discarding_sink_swallows_everything() {
        NowPlayingSink::discarding().send(RadioNowPlaying::new("http://s/live", "A - B"));
        NowPlayingSink::default().send(RadioNowPlaying::new("http://s/live", "A - B"));
    }
}
