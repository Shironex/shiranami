//! What the listener refuses before any route logic runs: oversized bodies,
//! bodies on bodiless methods, and clients that never finish their request.

// Test code: a failed unwrap is a failed test, with the location in the panic.
#![allow(clippy::unwrap_used)]

mod common;

use std::time::Duration;

use common::{Harness, Phone};
use shiranami_sync::auth::authorization_header;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

#[tokio::test(flavor = "multi_thread")]
async fn a_signed_get_with_a_body_is_a_bare_404() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    let path = "/v1/sync/hello";
    let body = b"surprise";
    // Correctly signed over the body, so only the method rule refuses it.
    let auth = authorization_header(
        &phone.device_id,
        &phone.secret,
        "GET",
        path,
        Phone::now(),
        &Phone::nonce(),
        body,
    );
    let response = phone
        .client
        .get(format!("{}{path}", phone.base))
        .header("authorization", auth)
        .body(body.to_vec())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), 404);
    assert!(response.bytes().await.unwrap().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn an_oversized_pairing_body_is_refused_unread() {
    let harness = Harness::start().await;
    let link = harness.qr();
    let parsed = shiranami_sync::PairingLink::parse(&link).unwrap();
    let response = reqwest::Client::new()
        .post(format!(
            "http://{}:{}/v1/sync/pair",
            parsed.hosts[0], parsed.port
        ))
        .header("content-type", "application/json")
        .body(vec![b' '; 64 * 1024])
        .send()
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), 413);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_that_never_finishes_its_request_head_is_dropped() {
    let harness = Harness::start().await;
    let address = harness.base.trim_start_matches("http://").to_owned();
    let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
    stream
        .write_all(b"GET /v1/sync/hello HTTP/1.1\r\nHost: x\r\n")
        .await
        .unwrap();

    let mut buffer = [0_u8; 512];
    let closed = tokio::time::timeout(
        shiranami_sync::listen::HEADER_READ_TIMEOUT + Duration::from_secs(5),
        stream.read(&mut buffer),
    )
    .await
    .expect("the server hangs up instead of waiting forever");
    // Either a clean close or a 408 head; never a hang.
    match closed {
        Ok(0) | Err(_) => {}
        Ok(read) => assert!(
            buffer[..read].starts_with(b"HTTP/1.1 408"),
            "unexpected reply: {:?}",
            String::from_utf8_lossy(&buffer[..read])
        ),
    }
}
