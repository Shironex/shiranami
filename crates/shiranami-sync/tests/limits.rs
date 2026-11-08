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

#[tokio::test(flavor = "multi_thread")]
async fn a_client_that_trickles_its_body_gets_a_408() {
    let harness = Harness::start().await;
    let address = harness.base.trim_start_matches("http://").to_owned();
    let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
    stream
        .write_all(
            b"POST /v1/sync/pair HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{\"",
        )
        .await
        .unwrap();

    let mut buffer = [0_u8; 512];
    let read = tokio::time::timeout(
        shiranami_sync::listen::BODY_READ_TIMEOUT + Duration::from_secs(5),
        stream.read(&mut buffer),
    )
    .await
    .expect("the server gives up on the body instead of waiting forever")
    .unwrap();
    assert!(
        buffer[..read].starts_with(b"HTTP/1.1 408"),
        "unexpected reply: {:?}",
        String::from_utf8_lossy(&buffer[..read])
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn one_address_cannot_hold_more_than_its_share_of_connections() {
    let harness = Harness::start().await;
    let phone = harness.paired_phone().await;
    let address = harness.base.trim_start_matches("http://").to_owned();

    let mut held = Vec::new();
    for _ in 0..shiranami_sync::listen::MAX_CONNECTIONS_PER_ADDRESS {
        held.push(tokio::net::TcpStream::connect(&address).await.unwrap());
    }
    // Give the accept loop time to count every held connection.
    tokio::time::sleep(Duration::from_millis(200)).await;

    let mut extra = tokio::net::TcpStream::connect(&address).await.unwrap();
    let _ = extra
        .write_all(b"GET /v1/sync/hello HTTP/1.1\r\nHost: x\r\n\r\n")
        .await;
    let mut buffer = [0_u8; 64];
    let read = tokio::time::timeout(Duration::from_secs(3), extra.read(&mut buffer))
        .await
        .expect("the connection over the cap is dropped at once");
    assert!(
        matches!(read, Ok(0) | Err(_)),
        "a connection over the cap was served: {:?}",
        read.map(|read| String::from_utf8_lossy(&buffer[..read]).into_owned())
    );

    // Hanging up gives the slots back.
    drop(held);
    let mut served = false;
    for _ in 0..50 {
        let path = "/v1/sync/hello";
        let reply = phone
            .client
            .get(format!("{}{path}", phone.base))
            .header("authorization", phone.auth("GET", path))
            .send()
            .await;
        if reply.is_ok_and(|reply| reply.status().as_u16() == 200) {
            served = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(served, "the address never got its slots back");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_idle_keep_alive_connection_is_closed() {
    let harness = Harness::start().await;
    let address = harness.base.trim_start_matches("http://").to_owned();
    let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
    stream
        .write_all(b"GET /v1/sync/hello HTTP/1.1\r\nHost: x\r\n\r\n")
        .await
        .unwrap();
    let mut buffer = [0_u8; 512];
    let read = stream.read(&mut buffer).await.unwrap();
    assert!(buffer[..read].starts_with(b"HTTP/1.1 404"));

    // Kept alive after the reply, then closed once the next head is late.
    let closed = tokio::time::timeout(
        shiranami_sync::listen::HEADER_READ_TIMEOUT + Duration::from_secs(5),
        stream.read(&mut buffer),
    )
    .await
    .expect("an idle connection is not kept open forever");
    assert!(
        matches!(closed, Ok(0) | Err(_)),
        "unexpected bytes on an idle connection"
    );
}
