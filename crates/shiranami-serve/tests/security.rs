//! What a process that is not the app gets when it finds the port.
//!
//! The threat that did not exist in v1: a custom URI scheme was reachable only
//! from the app's own renderer, but `127.0.0.1:<port>` is reachable from every
//! process on the machine and from any page the user has open. The port is not a
//! secret — `lsof` finds it instantly — so everything here rests on the session
//! token, the extension allowlist, and the containment guard, in that order.

mod common;

use common::Harness;
use reqwest::StatusCode;

/// Without the right first path segment, nothing is reachable — and nothing is
/// confirmed either. Every wrong-token response is the same 404 a nonexistent
/// route gets, so a prober cannot tell "wrong token" from "no such server".
#[tokio::test]
async fn a_wrong_token_reaches_nothing() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", 512);
    harness.write_art("cover.jpg", 128);

    let encoded = common::encode(&path.to_string_lossy());
    let wrong = harness.base_with_wrong_token();

    for url in [
        format!("{wrong}/audio?path={encoded}"),
        format!("{wrong}/art/cover.jpg"),
        format!("{wrong}/radio?url=http%3A%2F%2Fstream.example.com%2Flive"),
    ] {
        let response = harness.get(&url, &[]).await;
        assert_eq!(
            response.status(),
            StatusCode::NOT_FOUND,
            "{url} answered something other than a blanket 404"
        );
        assert!(
            !response
                .bytes()
                .await
                .expect("a body")
                .starts_with(&[0, 1, 2]),
            "a wrong token returned file contents"
        );
    }
}

/// Every malformed token shape, including the ones that would break a naive
/// comparison: empty, short, long, and the right token with something appended.
#[tokio::test]
async fn no_token_shape_slips_past_the_comparison() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", 512);
    let encoded = common::encode(&path.to_string_lossy());
    let real = harness.handle.token().as_str().to_owned();
    let address = harness.handle.address();

    let mut prefix = real.clone();
    prefix.pop();

    for token in [
        String::new(),
        "x".to_owned(),
        prefix,
        format!("{real}0"),
        format!("0{real}"),
        real.to_uppercase(),
    ] {
        let url = format!("http://{address}/{token}/audio?path={encoded}");
        let response = harness.get(&url, &[]).await;
        assert_ne!(
            response.status(),
            StatusCode::OK,
            "token `{token}` was accepted"
        );
    }
}

/// The right token does work — otherwise the test above would pass on a server
/// that refuses everything.
#[tokio::test]
async fn the_real_token_does_reach_the_file() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", 512);

    let response = harness.audio(&path, &[]).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.bytes().await.expect("a body").len(), 512);
}

/// A file that exists, is readable, and sits outside every allowed root. The
/// containment guard is the only thing standing between it and the wire.
#[tokio::test]
async fn a_path_outside_the_allowed_roots_is_refused() {
    let harness = Harness::start().await;
    let outside = harness.write_outside("private.mp3", 512);

    let response = harness.audio(&outside, &[]).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(response.text().await.expect("a body"), "Forbidden");
}

/// Traversal out of an allowed root, in the shapes a caller can actually send.
/// The guard resolves before it compares, so `..` segments cannot walk out.
#[tokio::test]
async fn traversal_out_of_an_allowed_root_is_refused() {
    let harness = Harness::start().await;
    let secret = harness.write_outside("secret.mp3", 512);
    let secret_name = secret
        .file_name()
        .and_then(|name| name.to_str())
        .expect("a fixture name");

    // A path that starts inside the music root and climbs out of it.
    let climbing = harness
        .music
        .path()
        .join("..")
        .join(
            harness
                .outside
                .path()
                .file_name()
                .expect("the outside dir has a name"),
        )
        .join(secret_name);

    let response = harness.audio(&climbing, &[]).await;
    assert_eq!(
        response.status(),
        StatusCode::FORBIDDEN,
        "a `..` climb out of an allowed root was served"
    );
}

/// A symlink inside an allowed root pointing outside it. The textual path is
/// contained; the file is not. This is why the guard resolves symlinks.
#[cfg(unix)]
#[tokio::test]
async fn a_symlink_escaping_an_allowed_root_is_refused() {
    let harness = Harness::start().await;
    let secret = harness.write_outside("secret.mp3", 512);
    let link = harness.music.path().join("innocent.mp3");
    std::os::unix::fs::symlink(&secret, &link).expect("the symlink is created");

    let response = harness.audio(&link, &[]).await;

    assert_eq!(
        response.status(),
        StatusCode::FORBIDDEN,
        "a symlink inside an allowed root served a file outside it"
    );
}

/// The allowlist runs before containment, so a non-audio file inside an allowed
/// root is refused on its extension. This is what stops the settings file and
/// the database — both of which live under the app data root — being readable.
#[tokio::test]
async fn a_non_audio_file_inside_an_allowed_root_is_refused() {
    let harness = Harness::start().await;

    for name in [
        "config.json",
        "library.db",
        "notes.txt",
        "id_rsa",
        "cover.jpg",
        "script.sh",
    ] {
        let path = harness.write_audio(name, 64);
        let response = harness.audio(&path, &[]).await;

        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "{name} was served by the audio route"
        );
    }
}

/// A directory whose name ends in an audio extension passes the allowlist and
/// the containment check, and must still not be served.
#[tokio::test]
async fn a_directory_is_not_a_file() {
    let harness = Harness::start().await;
    let directory = harness.music.path().join("album.mp3");
    std::fs::create_dir(&directory).expect("the directory is created");

    let response = harness.audio(&directory, &[]).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(response.text().await.expect("a body"), "Not a file");
}

#[tokio::test]
async fn a_missing_path_parameter_is_a_bad_request() {
    let harness = Harness::start().await;

    for url in [
        format!("{}/audio", harness.base()),
        format!("{}/audio?path=", harness.base()),
        format!("{}/audio?other=1", harness.base()),
    ] {
        let response = harness.get(&url, &[]).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{url}");
    }
}

/// Art traversal, in every shape the router can deliver — including the
/// percent-encoded separator, which axum decodes into the path parameter before
/// the handler sees it.
#[tokio::test]
async fn art_traversal_is_refused() {
    let harness = Harness::start().await;
    harness.write_art("cover.jpg", 128);
    let outside = harness.write_outside("secret.jpg", 128);

    for name in [
        "..%2F..%2Fetc%2Fpasswd.jpg",
        "..%2Fsecret.jpg",
        "..%5C..%5Cwindows%5Csystem32%5Cconfig.jpg",
        "%2Fetc%2Fpasswd.jpg",
        "..",
        "%2e%2e%2f%2e%2e%2fsecret.jpg",
    ] {
        let response = harness.art(name).await;
        assert!(
            response.status().is_client_error(),
            "art name `{name}` was answered with {}",
            response.status()
        );
        let body = response.bytes().await.expect("a body");
        assert_ne!(
            &body[..],
            &std::fs::read(&outside).expect("the fixture reads")[..],
            "art name `{name}` served a file outside the art directory"
        );
    }
}

/// The art directory holds images the app wrote. Anything else in it stays
/// unreachable, so a stray file beside the covers is not a leak.
#[tokio::test]
async fn a_non_image_in_the_art_directory_is_refused() {
    let harness = Harness::start().await;
    harness.write_art("secrets.json", 128);
    harness.write_art("notes.txt", 128);

    for name in ["secrets.json", "notes.txt"] {
        assert_eq!(
            harness.art(name).await.status(),
            StatusCode::FORBIDDEN,
            "{name} was served by the art route"
        );
    }
}

/// The audio route's own containment guard does not apply to art, so this pins
/// that the art route cannot be talked into serving a *music* file either.
#[tokio::test]
async fn the_art_route_cannot_reach_the_music_directory() {
    let harness = Harness::start().await;
    harness.write_audio("cover.jpg", 128);

    assert_eq!(
        harness.art("cover.jpg").await.status(),
        StatusCode::NOT_FOUND
    );
}

/// Two servers, two tokens. A token learned from one session is worthless
/// against the next, which is what makes the credential per-session.
#[tokio::test]
async fn each_session_mints_its_own_token() {
    let first = Harness::start().await;
    let second = Harness::start().await;

    assert_ne!(
        first.handle.token().as_str(),
        second.handle.token().as_str()
    );

    let path = second.write_audio("track.mp3", 128);
    let url = format!(
        "http://{}/{}/audio?path={}",
        second.handle.address(),
        first.handle.token().as_str(),
        common::encode(&path.to_string_lossy())
    );

    assert_eq!(second.get(&url, &[]).await.status(), StatusCode::NOT_FOUND);
}

/// Loopback only. A server on `0.0.0.0` would be a file server for the network
/// the laptop is attached to.
#[tokio::test]
async fn the_server_binds_loopback_on_an_ephemeral_port() {
    let harness = Harness::start().await;
    let address = harness.handle.address();

    assert!(address.ip().is_loopback(), "bound {address}, not loopback");
    assert_ne!(address.port(), 0, "port 0 means the OS assigned nothing");
    assert!(
        harness.base().starts_with(&format!("http://{address}/")),
        "the base URL must address the bound socket"
    );
    assert!(
        harness.base().ends_with(harness.handle.token().as_str()),
        "the base URL must carry the token, or every renderer URL is a 404"
    );
}

/// Shutdown actually stops the listener, so the port and its token do not
/// outlive the session that minted them.
#[tokio::test]
async fn shutdown_closes_the_listener() {
    let harness = Harness::start().await;
    let path = harness.write_audio("track.mp3", 128);
    let url = format!(
        "{}/audio?path={}",
        harness.base(),
        common::encode(&path.to_string_lossy())
    );
    let client = harness.client.clone();

    assert_eq!(harness.get(&url, &[]).await.status(), StatusCode::OK);

    let Harness { handle, .. } = harness;
    handle.shutdown().await;

    assert!(
        client.get(&url).send().await.is_err(),
        "the port still answers after shutdown"
    );
}
