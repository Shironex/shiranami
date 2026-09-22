//! Building the Discord presence card.
//!
//! Ported from `apps/desktop/src/main/integrations/discord-presence-builder.ts`,
//! which v1 kept free of its RPC client so it could be unit tested. The same
//! split holds here: this module knows nothing about sockets, and produces a
//! [`PresencePayload`] the socket layer translates.
//!
//! The large image is always the static app-logo asset. Shiranami's album art
//! is served over loopback and Discord cannot reach it, so there is nothing
//! else to show; that asset must exist in the Developer Portal for
//! [`SHIRANAMI_DISCORD_CLIENT_ID`](shiranami_core::models::SHIRANAMI_DISCORD_CLIENT_ID)
//! or the slot renders blank.

use shiranami_core::models::{
    DISCORD_LANDING_URL, DISCORD_LARGE_IMAGE_KEY, DISCORD_MAX_FIELD_LENGTH,
    DiscordMusicActivityType, DiscordMusicPresenceActivity, DiscordPresenceTemplate,
    DiscordRpcSettings,
};

/// Discord requires a string field to be at least two characters.
///
/// A one-character `details` is not truncated by Discord — it is rejected, so
/// the field has to be omitted entirely instead.
const MIN_FIELD_LENGTH: usize = 2;

/// Fallback hover text for the logo when the track has no usable album.
const DEFAULT_LARGE_IMAGE_TEXT: &str = "Shiranami";

/// The label on the landing-page button.
const BUTTON_LABEL: &str = "Get Shiranami";

/// One button on the presence card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresenceButton {
    /// Button text.
    pub label: String,
    /// Where it points.
    pub url: String,
}

/// Everything the socket layer needs to render one presence card.
///
/// A field that should not appear is `None` rather than empty: Discord treats
/// an absent key and a blank string differently, and v1 built the object by
/// conditional assignment for that reason.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PresencePayload {
    /// Line 1.
    pub details: Option<String>,
    /// Line 2.
    pub state: Option<String>,
    /// The art asset key, when the template shows the logo.
    pub large_image_key: Option<String>,
    /// Hover text for the logo: the album, or the app name.
    pub large_image_text: Option<String>,
    /// Unix **milliseconds** at which the track ends, driving Discord's
    /// countdown.
    ///
    /// Milliseconds because v1 handed its RPC client a `Date`, which the client
    /// serialized with `getTime()`. `discord-rich-presence`'s `Timestamps`
    /// documents the same unit, so the port is unit-for-unit.
    pub end_timestamp_ms: Option<i64>,
    /// The buttons, when the template shows one.
    pub buttons: Vec<PresenceButton>,
}

/// Which presence state a now-playing snapshot describes.
///
/// A snapshot with no title is idle even when it claims to be playing — v1
/// tested `!activity.title` before `isPlaying` for exactly that case, which is
/// what the player reports between tracks.
pub fn resolve_activity_type(
    activity: Option<&DiscordMusicPresenceActivity>,
) -> DiscordMusicActivityType {
    match activity {
        Some(activity) if !activity.title.is_empty() => {
            if activity.is_playing {
                DiscordMusicActivityType::Playing
            } else {
                DiscordMusicActivityType::Paused
            }
        }
        _ => DiscordMusicActivityType::Idle,
    }
}

/// Build the presence card for `activity` under `settings`.
///
/// `now_ms` is the clock the countdown is anchored to, passed in rather than
/// read so the mapping is a pure function of its inputs.
pub fn build_presence(
    activity: Option<&DiscordMusicPresenceActivity>,
    settings: &DiscordRpcSettings,
    now_ms: i64,
) -> PresencePayload {
    let activity_type = resolve_activity_type(activity);
    // Custom templates replace the defaults wholesale, per activity type.
    let template = settings.templates.for_activity(activity_type);

    // Two toggles that only apply when the user is *not* driving the templates:
    // once they are, the template's own switches are the whole answer.
    let show_track_text = settings.use_custom_templates || settings.show_track_details;
    let show_timestamp =
        (settings.use_custom_templates || settings.show_elapsed_time) && template.show_timestamp;

    let details = substitute(&template.details, activity);
    let state = if show_track_text {
        substitute(&template.state, activity)
    } else {
        String::new()
    };

    PresencePayload {
        details: long_enough(details),
        state: long_enough(state),
        large_image_key: template
            .show_large_image
            .then(|| DISCORD_LARGE_IMAGE_KEY.to_owned()),
        large_image_text: template
            .show_large_image
            .then(|| large_image_text(activity)),
        end_timestamp_ms: end_timestamp(activity, activity_type, show_timestamp, now_ms),
        buttons: buttons(template),
    }
}

/// A field Discord will accept, or nothing.
fn long_enough(text: String) -> Option<String> {
    (text.chars().count() >= MIN_FIELD_LENGTH).then_some(text)
}

/// The album as hover text, falling back to the app name.
fn large_image_text(activity: Option<&DiscordMusicPresenceActivity>) -> String {
    activity
        .map(|activity| activity.album.trim())
        .filter(|album| album.chars().count() >= MIN_FIELD_LENGTH)
        .map_or_else(|| DEFAULT_LARGE_IMAGE_TEXT.to_owned(), str::to_owned)
}

/// The buttons the template asks for.
fn buttons(template: &DiscordPresenceTemplate) -> Vec<PresenceButton> {
    if !template.show_button {
        return Vec::new();
    }

    vec![PresenceButton {
        label: BUTTON_LABEL.to_owned(),
        url: DISCORD_LANDING_URL.to_owned(),
    }]
}

/// When the track ends, if a countdown should be shown at all.
///
/// Four conditions, all v1's: the toggles allow it, a track is actually
/// *playing*, its length is known, and the playhead is sane. A frozen countdown
/// on a paused card reads as a bug, which is why `paused` is excluded even
/// though it has a duration.
fn end_timestamp(
    activity: Option<&DiscordMusicPresenceActivity>,
    activity_type: DiscordMusicActivityType,
    show_timestamp: bool,
    now_ms: i64,
) -> Option<i64> {
    if !show_timestamp || activity_type != DiscordMusicActivityType::Playing {
        return None;
    }

    let activity = activity?;

    // Bound as positive tests, then negated, so that a `NaN` fails both — which
    // is what v1's `duration > 0 && currentTime >= 0` did, since every
    // comparison against `NaN` is false. Writing the guard as `duration <= 0.0`
    // would silently let a `NaN` through into the arithmetic below.
    let has_known_length = activity.duration > 0.0;
    let has_sane_playhead = activity.current_time >= 0.0;
    if !has_known_length || !has_sane_playhead {
        return None;
    }

    let remaining_ms = ((activity.duration - activity.current_time) * 1_000.0).max(0.0);
    Some(now_ms.saturating_add(remaining_ms.round() as i64))
}

/// Replace the template tokens, tidy the result, and cap its length.
///
/// An absent field substitutes to nothing, which is what leaves the double
/// spaces v1 collapsed afterwards: `"{title} by {artist}"` with no artist would
/// otherwise render as `"Song by "`.
fn substitute(template: &str, activity: Option<&DiscordMusicPresenceActivity>) -> String {
    if template.is_empty() {
        return String::new();
    }

    let (title, artist, album) = activity.map_or(("", "", ""), |activity| {
        (
            activity.title.as_str(),
            activity.artist.as_str(),
            activity.album.as_str(),
        )
    });

    let replaced = template
        .replace("{title}", title)
        .replace("{artist}", artist)
        .replace("{album}", album);

    truncate(&collapse_whitespace(&replaced))
}

/// Collapse runs of two or more whitespace characters into one space, then trim.
///
/// v1's `replace(/\s{2,}/g, ' ').trim()`. JavaScript's `\s` is Unicode-aware, so
/// `char::is_whitespace` is the matching predicate rather than an ASCII test —
/// a non-breaking space in a track title has to collapse the same way.
fn collapse_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run: Vec<char> = Vec::new();

    for character in text.chars() {
        if character.is_whitespace() {
            run.push(character);
            continue;
        }
        // Only a run of *two or more* collapses. A lone tab is left alone,
        // because `/\s{2,}/` does not match it — v1 would not have replaced it
        // either, and turning it into a space would be a silent improvement
        // nobody asked for.
        match run.len() {
            0 => {}
            1 => out.push(run[0]),
            _ => out.push(' '),
        }
        run.clear();
        out.push(character);
    }

    // A trailing run is never emitted, and a leading one is trimmed off: between
    // them that is v1's `.trim()`.
    out.trim_start().to_owned()
}

/// Cap a field at Discord's length limit, marking the cut with an ellipsis.
///
/// Counted in **characters**, where v1 counted UTF-16 code units. The deviation
/// is deliberate: `slice(0, 127)` on a string whose 127th unit is the first half
/// of a surrogate pair produces an unpaired surrogate, so v1 could hand Discord
/// an ill-formed field for a title containing an emoji. Counting characters
/// cannot split one, and the two agree for every title inside the limit — which
/// is every title that is not 128 characters long.
fn truncate(text: &str) -> String {
    if text.chars().count() <= DISCORD_MAX_FIELD_LENGTH {
        return text.to_owned();
    }

    let mut out: String = text.chars().take(DISCORD_MAX_FIELD_LENGTH - 1).collect();
    out.push('…');
    out
}
