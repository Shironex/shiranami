//! Which audio streams end when: per device, a cancellation token every
//! stream of that device stops on, fired by a revoke or by shutdown.

use std::collections::{HashMap, HashSet};

use tokio_util::sync::CancellationToken;

/// Per device, a child of the shutdown token that every audio stream of that
/// device ends on, plus the devices revoked while the listener runs.
///
/// Remembering revoked ids closes a race: a request authenticated just before
/// the revoke could otherwise ask for its token just after it, get a fresh
/// one and stream the whole file. Device ids are random and never reused, so
/// the set only grows by one id per revoke.
#[derive(Default)]
pub(crate) struct DeviceStreams {
    tokens: HashMap<String, CancellationToken>,
    revoked: HashSet<String>,
}

impl DeviceStreams {
    /// The token `device_id`'s streams stop on: already cancelled for a
    /// revoked device.
    pub(crate) fn token(
        &mut self,
        device_id: &str,
        shutdown: &CancellationToken,
    ) -> CancellationToken {
        if self.revoked.contains(device_id) {
            let token = CancellationToken::new();
            token.cancel();
            return token;
        }
        self.tokens
            .entry(device_id.to_owned())
            .or_insert_with(|| shutdown.child_token())
            .clone()
    }

    /// End `device_id`'s open streams and refuse it a token from now on.
    pub(crate) fn revoke(&mut self, device_id: &str) {
        self.revoked.insert(device_id.to_owned());
        if let Some(token) = self.tokens.remove(device_id) {
            token.cancel();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revoking_ends_open_streams_and_any_asked_for_later() {
        let shutdown = CancellationToken::new();
        let mut streams = DeviceStreams::default();
        let open = streams.token("phone", &shutdown);
        let other = streams.token("tablet", &shutdown);

        streams.revoke("phone");
        assert!(open.is_cancelled());
        // A request authenticated before the revoke, asking only now.
        assert!(streams.token("phone", &shutdown).is_cancelled());
        assert!(!other.is_cancelled());
        assert!(!streams.token("tablet", &shutdown).is_cancelled());
    }

    #[test]
    fn shutting_down_ends_every_stream() {
        let shutdown = CancellationToken::new();
        let mut streams = DeviceStreams::default();
        let open = streams.token("phone", &shutdown);
        shutdown.cancel();
        assert!(open.is_cancelled());
    }
}
