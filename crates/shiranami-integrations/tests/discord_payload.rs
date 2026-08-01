//! The presence-card mapping.
//!
//! Every case in v1's `discord-presence-builder.test.ts`, plus the ones its
//! `toBeInstanceOf(Date)` assertion could not make: the countdown's actual
//! value, and what happens to a title that is too long in code units but not in
//! characters.

use shiranami_core::models::{
    DiscordMusicActivityType, DiscordMusicPresenceActivity, DiscordRpcSettings,
};
use shiranami_integrations::discord::{PresenceButton, build_presence, resolve_activity_type};

/// A fixed clock, so the countdown is an exact value rather than a shape.
const NOW_MS: i64 = 1_700_000_000_000;

fn playing() -> DiscordMusicPresenceActivity {
    DiscordMusicPresenceActivity {
        is_playing: true,
        title: "Idol".to_owned(),
        artist: "Yoasobi".to_owned(),
        album: "THE BOOK 3".to_owned(),
        duration: 222.0,
        current_time: 60.0,
    }
}

fn paused() -> DiscordMusicPresenceActivity {
    DiscordMusicPresenceActivity {
        is_playing: false,
        ..playing()
    }
}

fn settings() -> DiscordRpcSettings {
    DiscordRpcSettings {
        enabled: true,
        ..DiscordRpcSettings::default()
    }
}

/// Custom-template mode, so the per-template switches are what decide.
fn custom() -> DiscordRpcSettings {
    DiscordRpcSettings {
        use_custom_templates: true,
        ..settings()
    }
}

#[test]
fn a_snapshot_with_no_title_is_idle_however_it_describes_itself() {
    assert_eq!(resolve_activity_type(None), DiscordMusicActivityType::Idle);
    assert_eq!(
        resolve_activity_type(Some(&DiscordMusicPresenceActivity {
            title: String::new(),
            ..playing()
        })),
        DiscordMusicActivityType::Idle,
        "the player reports a titleless snapshot between tracks"
    );
    assert_eq!(
        resolve_activity_type(Some(&playing())),
        DiscordMusicActivityType::Playing
    );
    assert_eq!(
        resolve_activity_type(Some(&paused())),
        DiscordMusicActivityType::Paused
    );
}

#[test]
fn the_default_templates_render_each_state() {
    let card = build_presence(Some(&playing()), &settings(), NOW_MS);
    assert_eq!(card.details.as_deref(), Some("Listening to music"));
    assert_eq!(card.state.as_deref(), Some("Idol by Yoasobi"));

    let card = build_presence(Some(&paused()), &settings(), NOW_MS);
    assert_eq!(card.details.as_deref(), Some("Music paused"));
    assert_eq!(card.state.as_deref(), Some("Idol by Yoasobi"));

    let card = build_presence(None, &settings(), NOW_MS);
    assert_eq!(card.details.as_deref(), Some("Idle"));
    assert_eq!(
        card.state, None,
        "the idle template has no second line, and an empty field is omitted"
    );
}

#[test]
fn the_logo_carries_the_album_as_hover_text() {
    let card = build_presence(Some(&playing()), &settings(), NOW_MS);
    assert_eq!(card.large_image_key.as_deref(), Some("shiranami"));
    assert_eq!(card.large_image_text.as_deref(), Some("THE BOOK 3"));
}

#[test]
fn the_hover_text_falls_back_to_the_app_name_without_an_album() {
    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            album: String::new(),
            ..playing()
        }),
        &settings(),
        NOW_MS,
    );
    assert_eq!(card.large_image_text.as_deref(), Some("Shiranami"));
}

/// Discord rejects a one-character string field rather than truncating it, so
/// a one-character album must not become the hover text.
#[test]
fn a_one_character_album_falls_back_rather_than_being_sent() {
    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            album: "X".to_owned(),
            ..playing()
        }),
        &settings(),
        NOW_MS,
    );
    assert_eq!(card.large_image_text.as_deref(), Some("Shiranami"));
}

#[test]
fn the_logo_is_omitted_entirely_when_the_template_hides_it() {
    let mut custom = custom();
    custom.templates.playing.show_large_image = false;

    let card = build_presence(Some(&playing()), &custom, NOW_MS);
    assert_eq!(card.large_image_key, None);
    assert_eq!(card.large_image_text, None);
}

/// v1's test could only assert this was a `Date`. The value is what Discord
/// counts down from, so it is worth pinning: 222 s long, 60 s in, 162 s left.
#[test]
fn the_countdown_ends_when_the_track_does() {
    let card = build_presence(Some(&playing()), &settings(), NOW_MS);
    assert_eq!(card.end_timestamp_ms, Some(NOW_MS + 162_000));
}

/// A frozen countdown on a paused card reads as a bug, so the playing-only
/// guard suppresses it even when the template would allow it.
#[test]
fn a_paused_track_never_shows_a_countdown() {
    let mut custom = custom();
    custom.templates.paused.show_timestamp = true;

    assert_eq!(
        build_presence(Some(&paused()), &custom, NOW_MS).end_timestamp_ms,
        None
    );
}

#[test]
fn the_countdown_obeys_both_the_legacy_toggle_and_the_template() {
    let legacy_off = DiscordRpcSettings {
        show_elapsed_time: false,
        ..settings()
    };
    assert_eq!(
        build_presence(Some(&playing()), &legacy_off, NOW_MS).end_timestamp_ms,
        None,
        "the legacy toggle suppresses it"
    );

    let mut template_off = custom();
    template_off.templates.playing.show_timestamp = false;
    assert_eq!(
        build_presence(Some(&playing()), &template_off, NOW_MS).end_timestamp_ms,
        None,
        "the template suppresses it in custom mode"
    );

    // …and in custom mode the legacy toggle no longer applies.
    let custom_with_legacy_off = DiscordRpcSettings {
        show_elapsed_time: false,
        ..custom()
    };
    assert_eq!(
        build_presence(Some(&playing()), &custom_with_legacy_off, NOW_MS).end_timestamp_ms,
        Some(NOW_MS + 162_000),
        "custom templates own the decision once they are switched on"
    );
}

#[test]
fn a_track_of_unknown_length_shows_no_countdown() {
    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            duration: 0.0,
            ..playing()
        }),
        &settings(),
        NOW_MS,
    );
    assert_eq!(card.end_timestamp_ms, None);
}

/// A playhead past the end — a rounding artefact at the very end of a track —
/// must clamp to "ending now" rather than producing a countdown in the past.
#[test]
fn a_playhead_past_the_end_clamps_to_now() {
    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            current_time: 300.0,
            ..playing()
        }),
        &settings(),
        NOW_MS,
    );
    assert_eq!(card.end_timestamp_ms, Some(NOW_MS));
}

#[test]
fn the_landing_button_follows_the_template() {
    assert_eq!(
        build_presence(Some(&playing()), &settings(), NOW_MS).buttons,
        vec![PresenceButton {
            label: "Get Shiranami".to_owned(),
            url: "https://shiranami.app".to_owned(),
        }]
    );
    assert!(
        build_presence(Some(&paused()), &settings(), NOW_MS)
            .buttons
            .is_empty(),
        "the paused template carries no button"
    );
}

#[test]
fn the_track_details_toggle_drops_only_the_state_line() {
    let card = build_presence(
        Some(&playing()),
        &DiscordRpcSettings {
            show_track_details: false,
            ..settings()
        },
        NOW_MS,
    );
    assert_eq!(card.state, None);
    assert_eq!(card.details.as_deref(), Some("Listening to music"));
}

/// Switching to custom templates means the user is writing the text, so the
/// legacy "show track details" toggle stops applying.
#[test]
fn custom_templates_show_the_state_line_regardless_of_the_legacy_toggle() {
    let card = build_presence(
        Some(&playing()),
        &DiscordRpcSettings {
            show_track_details: false,
            ..custom()
        },
        NOW_MS,
    );
    assert_eq!(card.state.as_deref(), Some("Idol by Yoasobi"));
}

#[test]
fn an_over_long_field_is_truncated_with_an_ellipsis() {
    let mut custom = custom();
    custom.templates.playing.state = "{album}".to_owned();

    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            album: "A".repeat(200),
            ..playing()
        }),
        &custom,
        NOW_MS,
    );

    let state = card.state.expect("a state line");
    assert_eq!(state.chars().count(), 128);
    assert!(state.ends_with('…'));
}

/// v1 sliced at 127 **UTF-16 code units**, which splits a surrogate pair and can
/// hand Discord an unpaired surrogate. Counting characters cannot.
#[test]
fn truncation_never_splits_a_multi_byte_character() {
    let mut custom = custom();
    custom.templates.playing.state = "{album}".to_owned();

    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            album: "🎵".repeat(200),
            ..playing()
        }),
        &custom,
        NOW_MS,
    );

    let state = card.state.expect("a state line");
    assert_eq!(state.chars().count(), 128);
    assert!(state.ends_with('…'));
    assert!(
        state.chars().take(127).all(|character| character == '🎵'),
        "every kept character survived whole"
    );
}

/// An empty substitution leaves a gap the template did not intend.
#[test]
fn an_empty_token_substitution_has_its_gap_collapsed() {
    let mut custom = custom();
    custom.templates.playing.state = "{title} by {artist}".to_owned();

    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            artist: String::new(),
            ..playing()
        }),
        &custom,
        NOW_MS,
    );
    assert_eq!(card.state.as_deref(), Some("Idol by"));
}

/// Two adjacent empty tokens leave a run of spaces, which collapses to one.
#[test]
fn a_run_of_whitespace_collapses_to_a_single_space() {
    let mut custom = custom();
    custom.templates.playing.state = "{artist}  —  {album}".to_owned();

    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            artist: String::new(),
            album: "Nagare".to_owned(),
            ..playing()
        }),
        &custom,
        NOW_MS,
    );
    assert_eq!(card.state.as_deref(), Some("— Nagare"));
}

/// A template that renders to one character is omitted rather than sent, since
/// Discord refuses it.
#[test]
fn a_field_that_renders_too_short_is_omitted() {
    let mut custom = custom();
    custom.templates.playing.details = "{artist}".to_owned();
    custom.templates.playing.state = "{album}".to_owned();

    let card = build_presence(
        Some(&DiscordMusicPresenceActivity {
            artist: "X".to_owned(),
            album: String::new(),
            ..playing()
        }),
        &custom,
        NOW_MS,
    );
    assert_eq!(card.details, None);
    assert_eq!(card.state, None);
}
