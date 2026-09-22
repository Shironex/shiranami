//! The connect / reconnect / throttle state machine.
//!
//! Ported from the module-level mutable state of
//! `apps/desktop/src/main/integrations/discord-rpc.ts` — `isConnected`,
//! `reconnectDelay`, `lastUpdateTime`, `pendingActivity`,
//! `loginFailureNotified` — which v1 kept as file-scope `let`s and mutated from
//! six functions.
//!
//! Gathering them into one type with pure transitions is what makes the
//! behaviour testable at all. Every case this machine exists for — Discord not
//! running, a socket dropping mid-session, a reconnect storm, a backward clock
//! jump — is either impossible or extremely awkward to produce against a real
//! Discord, and all of them are ordinary inputs here.

use std::time::Duration;

/// Discord rate-limits presence updates to one per 15 seconds.
///
/// Exceeding it does not merely drop an update; it is the limit v1's throttle
/// exists to respect, and a reconnect storm re-emitting the current activity is
/// the path most likely to trip it.
pub const MIN_UPDATE_INTERVAL: Duration = Duration::from_secs(15);

/// The first reconnect delay after a failed connection.
pub const RECONNECT_BASE: Duration = Duration::from_secs(5);

/// The ceiling the reconnect delay doubles up to.
pub const RECONNECT_MAX: Duration = Duration::from_secs(60);

/// What the caller should do about a presence update.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateTiming {
    /// Send it now.
    Now,
    /// Hold it and send after this delay; a later update replaces it.
    After(Duration),
}

/// What a failed connection attempt costs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConnectFailure {
    /// How long to wait before trying again.
    pub retry_in: Duration,
    /// Whether to raise a system notice for it.
    pub notify: bool,
}

/// The connection and throttle state.
#[derive(Debug, Clone, PartialEq)]
pub struct ReconnectState {
    connected: bool,
    reconnect_delay: Duration,
    last_update_ms: Option<i64>,
    login_failure_notified: bool,
}

impl Default for ReconnectState {
    fn default() -> Self {
        Self {
            connected: false,
            reconnect_delay: RECONNECT_BASE,
            last_update_ms: None,
            login_failure_notified: false,
        }
    }
}

impl ReconnectState {
    /// Whether the socket is believed to be up.
    pub fn is_connected(&self) -> bool {
        self.connected
    }

    /// The delay before the next reconnect attempt.
    pub fn reconnect_delay(&self) -> Duration {
        self.reconnect_delay
    }

    /// A connection succeeded.
    ///
    /// Resets the backoff and re-arms the failure notice, so a Discord that
    /// comes back and then goes away again tells the user the second time too.
    pub fn on_connected(&mut self) {
        self.connected = true;
        self.reconnect_delay = RECONNECT_BASE;
        self.login_failure_notified = false;
    }

    /// A connection attempt failed.
    ///
    /// Returns how long to wait before retrying, and whether to tell the user.
    ///
    /// Both answers come back together on purpose. v1 scheduled its retry with
    /// the current delay and doubled it afterwards, an ordering that is invisible
    /// in a caller reading the field separately and produces a first retry of ten
    /// seconds instead of five if it is got backwards. Returning the delay makes
    /// it impossible to read at the wrong moment.
    ///
    /// Only the first failure in a run is reported: the backoff starts at five
    /// seconds, so notifying on every attempt would be a toast every five
    /// seconds for anyone who left Rich Presence on without Discord installed.
    /// The notice gate's five-minute cooldown would blunt that; this flag is
    /// what stops it being raised at all until something changes.
    pub fn on_connect_failed(&mut self) -> ConnectFailure {
        self.connected = false;

        let notify = !self.login_failure_notified;
        self.login_failure_notified = true;

        let retry_in = self.reconnect_delay;
        self.reconnect_delay = (self.reconnect_delay * 2).min(RECONNECT_MAX);

        ConnectFailure { retry_in, notify }
    }

    /// The socket dropped.
    ///
    /// Distinct from a failed connect: a drop is not a login failure, so it does
    /// not consume the one-shot notice. v1 reached this through its client's
    /// `disconnected` event; here it is a failed write — see
    /// [`super::socket`] for why that difference does not matter.
    pub fn on_disconnected(&mut self) {
        self.connected = false;
    }

    /// A deliberate teardown: settings switched off, or shutdown.
    ///
    /// Clears the failure flag as v1 did, so that switching Rich Presence off
    /// and on again can report a fresh failure rather than staying silent about
    /// a Discord that is still missing.
    pub fn on_shutdown(&mut self) {
        self.connected = false;
        self.reconnect_delay = RECONNECT_BASE;
        self.login_failure_notified = false;
    }

    /// Whether a presence update may go out now, and if not, how long to wait.
    pub fn timing(&self, now_ms: i64) -> UpdateTiming {
        let Some(last) = self.last_update_ms else {
            return UpdateTiming::Now;
        };

        // Clamped at zero so a backward wall-clock jump — an NTP correction, or
        // a user changing the system clock — cannot make the window look
        // negative and stall every later update. v1 clamped it for the same
        // reason.
        let elapsed = now_ms.saturating_sub(last).max(0);
        let interval = i64::try_from(MIN_UPDATE_INTERVAL.as_millis()).unwrap_or(i64::MAX);

        if elapsed >= interval {
            UpdateTiming::Now
        } else {
            UpdateTiming::After(Duration::from_millis(
                u64::try_from(interval - elapsed).unwrap_or(0),
            ))
        }
    }

    /// Record that an update went out at `now_ms`.
    pub fn on_update_sent(&mut self, now_ms: i64) {
        self.last_update_ms = Some(now_ms);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INTERVAL_MS: i64 = 15_000;

    #[test]
    fn a_fresh_state_is_disconnected_and_ready_to_send() {
        let state = ReconnectState::default();
        assert!(!state.is_connected());
        assert_eq!(state.reconnect_delay(), RECONNECT_BASE);
        assert_eq!(state.timing(0), UpdateTiming::Now);
    }

    /// v1's ladder: 5 s, then 10, 20, 40, and 60 forever. The first retry is
    /// five seconds, not ten — the off-by-one this ladder exists to pin.
    #[test]
    fn the_reconnect_delay_doubles_up_to_a_minute() {
        let mut state = ReconnectState::default();

        let delays: Vec<Duration> = (0..7).map(|_| state.on_connect_failed().retry_in).collect();

        assert_eq!(
            delays,
            vec![
                Duration::from_secs(5),
                Duration::from_secs(10),
                Duration::from_secs(20),
                Duration::from_secs(40),
                RECONNECT_MAX,
                RECONNECT_MAX,
                RECONNECT_MAX,
            ]
        );
    }

    /// The property the flag exists for: a backoff loop reports once, not once
    /// every five seconds.
    #[test]
    fn only_the_first_failure_in_a_run_is_reported() {
        let mut state = ReconnectState::default();
        assert!(
            state.on_connect_failed().notify,
            "the first failure is reported"
        );
        for _ in 0..5 {
            assert!(!state.on_connect_failed().notify, "the rest are suppressed");
        }
    }

    /// Recovering re-arms the notice, so a Discord that quits again is reported.
    #[test]
    fn connecting_resets_the_backoff_and_re_arms_the_notice() {
        let mut state = ReconnectState::default();
        state.on_connect_failed();
        state.on_connect_failed();
        assert_eq!(state.reconnect_delay(), Duration::from_secs(20));

        state.on_connected();
        assert!(state.is_connected());
        assert_eq!(state.reconnect_delay(), RECONNECT_BASE);

        let failure = state.on_connect_failed();
        assert!(
            failure.notify,
            "a failure after a recovery is reported again"
        );
        assert_eq!(
            failure.retry_in, RECONNECT_BASE,
            "and backs off from scratch"
        );
    }

    /// Switching Rich Presence off and on again must be able to report a fresh
    /// failure, rather than staying silent about a Discord that is still gone.
    #[test]
    fn a_deliberate_teardown_re_arms_the_notice_too() {
        let mut state = ReconnectState::default();
        state.on_connect_failed();
        assert!(!state.on_connect_failed().notify);

        state.on_shutdown();

        assert!(!state.is_connected());
        assert_eq!(state.reconnect_delay(), RECONNECT_BASE);
        assert!(state.on_connect_failed().notify);
    }

    /// A dropped socket is not a login failure, so it must not consume the
    /// one-shot notice that a genuine login failure needs.
    #[test]
    fn a_dropped_socket_does_not_consume_the_failure_notice() {
        let mut state = ReconnectState::default();
        state.on_connected();

        state.on_disconnected();

        assert!(!state.is_connected());
        assert!(
            state.on_connect_failed().notify,
            "the reconnect that follows a drop can still report its failure"
        );
    }

    #[test]
    fn the_first_update_goes_out_immediately() {
        let state = ReconnectState::default();
        assert_eq!(state.timing(1_000_000), UpdateTiming::Now);
    }

    /// Discord's rate limit is one update per fifteen seconds.
    #[test]
    fn a_second_update_inside_the_window_waits_out_the_remainder() {
        let mut state = ReconnectState::default();
        state.on_update_sent(1_000_000);

        assert_eq!(
            state.timing(1_000_000),
            UpdateTiming::After(MIN_UPDATE_INTERVAL)
        );
        assert_eq!(
            state.timing(1_005_000),
            UpdateTiming::After(Duration::from_secs(10))
        );
        assert_eq!(
            state.timing(1_000_000 + INTERVAL_MS - 1),
            UpdateTiming::After(Duration::from_millis(1))
        );
    }

    #[test]
    fn an_update_exactly_on_the_boundary_goes_out() {
        let mut state = ReconnectState::default();
        state.on_update_sent(1_000_000);
        assert_eq!(state.timing(1_000_000 + INTERVAL_MS), UpdateTiming::Now);
        assert_eq!(state.timing(1_000_000 + INTERVAL_MS + 1), UpdateTiming::Now);
    }

    /// An NTP correction or a user changing the system clock must not stall
    /// every later update behind a window that looks negative.
    #[test]
    fn a_backward_clock_jump_does_not_stall_updates() {
        let mut state = ReconnectState::default();
        state.on_update_sent(1_000_000);

        assert_eq!(
            state.timing(900_000),
            UpdateTiming::After(MIN_UPDATE_INTERVAL),
            "the window is treated as freshly opened, never as already elapsed"
        );
    }
}
