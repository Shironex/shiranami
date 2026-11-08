# shiranami-sync

LAN sync v0: pair a phone by QR code, then let it copy the desktop library.
One way only (desktop to phone). Design: `docs/research/mobile-2026-11/lan-sync.md`.

## Lifecycle

- Off by default. The listener runs only while the user has turned "Sync with phone" on in Settings, and
  stops when they turn it off or quit. Nothing is persisted about the on/off state.
- Binds every private IPv4 address (RFC 1918 and 169.254/16) on a physical-looking interface, one
  socket each, never `0.0.0.0`, never loopback. Refuses to start without one. Ephemeral port.
- Skips VPN, overlay, container and VM interfaces even when their address is private: names starting
  `utun`, `tun`, `tap`, `wg`, `docker`, `br-`, `veth`, `vboxnet`, `vmnet`, `virbr`, `zt`, `tailscale`,
  `bridge`, `ipsec` or `ppp`, and Windows adapters named after Hyper-V, WSL, VirtualBox, VMware,
  Tailscale, ZeroTier, WireGuard, OpenVPN or Docker, and any point-to-point interface. CGNAT space
  (`100.64.0.0/10`) never counts. Windows adapter names are friendly names the user or a VPN client
  can set, so a full-tunnel VPN adapter with an unusual name and a private address may still be listed
  there; the phone only pairs with what it reaches.
- The address the OS uses for its default route is listed first in the QR.
- Advertises `_shiranami._tcp.local.` over mDNS while running (TXT `v=2`, `id=<desktopId>`). A multicast
  failure is logged and ignored; the QR code is the primary path in v0.
- Separate from `shiranami-serve` (the loopback media server). It reuses that crate's Range parser,
  extension allowlist and chunked file streaming, nothing else.

## Pairing

The desktop opens a 5 minute window and shows a QR code with this link:

```
shiranami://pair?v=2&h=192.168.1.20,10.0.0.5&p=47321&id=<desktopId>&n=<desktopName>&t=<nonce>&k=<secret>
```

| Param | Meaning                                           |
| ----- | ------------------------------------------------- |
| `v`   | protocol version (2)                              |
| `h`   | comma separated host candidates, try in order     |
| `p`   | port                                              |
| `id`  | desktop id (stable per install)                   |
| `n`   | desktop display name                              |
| `t`   | one-time pairing nonce                            |
| `k`   | 32-byte pairing secret, base64url without padding |

The phone makes an ephemeral X25519 key pair for this attempt and sends `POST /v1/sync/pair`:

```json
{
  "nonce": "<t>",
  "deviceName": "Pixel 8",
  "platform": "android",
  "publicKey": "<phone X25519 public key, base64url>",
  "proof": "<base64url>"
}
```

```
proof = HMAC-SHA256(k, "shiranami-sync/v2/pair\n" + nonce + "\n" + deviceName + "\n" + platform
                       + "\n" + publicKey)
```

The proof shows the phone saw the QR, and covering `publicKey` stops anyone on the path from swapping in
their own key. A key that is not 32 bytes, or a low-order key whose shared secret would be predictable,
is a `400`.

The desktop shows an Allow / Deny prompt (the request is held up to 120 s). On Allow it makes its own
ephemeral key pair and answers
`PairResponse { deviceId, publicKey, keyProof, desktopId, desktopName, libraryId, protocolVersion,
serverTime }`, `publicKey` being the desktop's, and closes the window, so one QR pairs one phone.
`keyProof` authenticates the desktop key:

```
keyProof = base64url(HMAC-SHA256(k, "shiranami-sync/v2/pair-response\n" + deviceId
                                    + "\n" + phonePublicKey + "\n" + desktopPublicKey))
```

The phone checks it (`verifyPairResponse` in `@shiranami/contracts/sync`) and refuses the pairing when
it does not match, so someone who answers in the desktop's place with their own key, but never saw the
QR, is caught. Both sides then derive the device secret; it never crosses the wire:

```
shared       = X25519(own private key, other side's public key)
deviceSecret = HMAC-SHA256(shared, "shiranami-sync/v2/device-secret\n" + deviceId + "\n" + k
                                   + "\n" + phonePublicKey + "\n" + desktopPublicKey)
```

`k` is the `k=` text of the link and both keys are their base64url text. Both private keys are discarded
once the secret is derived.

The desktop stores it in `sync_peers` (SQLite); the phone should keep it in `expo-secure-store`.
Pairing errors: `410 pairing_closed` (no window, expired, or a stale QR), `409 pairing_busy`,
`403 pairing_denied`, `408 pairing_timeout`, `429 rate_limited` (5 attempts per minute per address),
`404` (bad proof; 10 bad proofs close the window).

## Signed requests

Every other route needs:

```
Authorization: SNM1 dev=<deviceId>,ts=<unix seconds>,n=<nonce>,sig=<base64url>

sig = HMAC-SHA256(deviceSecret,
        "SNM1\n" + METHOD + "\n" + pathAndQuery + "\n" + ts + "\n" + nonce + "\n" + hex(SHA-256(body)))
```

- `nonce`: 16 to 64 chars of `[A-Za-z0-9_-]`, never reused (16 random bytes in base64url is fine).
- `ts` must be within 120 s of the desktop clock (`serverTime` in the pair and hello bodies lets the
  phone correct for skew).
- The query string is signed; `Range` and `If-Range` are not.
- Unknown device, bad signature, stale `ts`, reused nonce, unknown route: **404 with an empty body**.
- 30 failures per minute from one address: the same bare 404 for everything from it for the rest of
  the minute, so being blocked looks like any other refusal.
- Per device: 50 requests per second (burst 100), 4 concurrent audio downloads (`429 too_many_streams`).
- A body on a GET or DELETE is refused with the same bare 404. Bodies over 16 KiB get `413` before any
  route runs (the largest real one, a pairing request, is a few hundred bytes).
- Transport limits per listening socket: 64 open connections and 8 from any one address (more are
  dropped at accept), 10 s to send a request head (then the connection is closed; the same clock closes
  an idle keep-alive connection), and 10 s to send the rest of the body once the head is in (then
  `408`). The body is read before the request joins the 16 handled at once across the listener (more
  wait; a streaming audio body does not hold a slot), so a client trickling its body never holds one.
  An oversized or late body gets its `413` or `408` before the blocked-address check, so a blocked
  address can tell those apart from the bare 404.

## Endpoints (v0)

| Method + path                          | Response                                              |
| -------------------------------------- | ----------------------------------------------------- |
| `POST /v1/sync/pair`                   | `PairResponse` (unsigned, see above)                  |
| `GET /v1/sync/hello`                   | `SyncHello`: versions, ids, capabilities, track count |
| `GET /v1/sync/manifest?cursor=&limit=` | `LibraryManifestPage` (default 500, max 1000)         |
| `GET /v1/sync/playlists`               | `PlaylistsSnapshot` (manual playlists, ordered ids)   |
| `GET /v1/sync/favorites`               | `FavoritesSnapshot`                                   |
| `GET /v1/sync/history?cursor=&limit=`  | `HistoryPage`, oldest first (default 1000, max 5000)  |
| `GET /v1/sync/art/{hash}`              | `image/jpeg`, immutable                               |
| `GET /v1/sync/tracks/{id}/audio`       | audio bytes, `Range`, `If-Range`, `ETag`              |
| `DELETE /v1/sync/devices/self`         | 204, unpairs the calling device                       |

Cursors are opaque strings; pass `nextCursor` back until `hasMore` is false. Manifest tracks carry
`contentHash` (match tracks the phone already has), `artworkHash`, `sizeBytes` and `fileVersion`
(the audio `ETag` without quotes). Audio is addressed by track id only; the desktop resolves the path and
re-runs the extension allowlist and folder containment check, so a paired phone cannot read outside the
library. Resume a download with `Range: bytes=<partial size>-` plus `If-Range: "<fileVersion>"`; a changed
file answers 200 with the whole new body instead of a mismatched 206. Errors other than 404 carry
`SyncErrorBody { error, message }`.

## Contract types

Every body above is a Rust type in `src/wire.rs`, exported to `packages/contracts/src/generated/sync.ts`
by the same `cargo test` run the drift guard diffs. The phone imports them, plus the link parser, the
X25519 helpers (`generatePairingKeyPair`, `pairingSharedSecret`, on `@noble/curves`, pure JS) and the
messages to HMAC, from `@shiranami/contracts/sync`, a subpath with no Tauri import. Shared test vectors
(RFC 7748 keys) are asserted by `tests/contract_vectors.rs` and `packages/contracts/src/sync/sync.test.ts`.

## Versioning

- The path carries the major version (`/v1`). A breaking change is `/v2`, served beside `/v1` for a while.
- `hello.protocolVersion` / `minProtocolVersion` say what the desktop speaks. Both are 2: version 2 added
  the X25519 exchange to pairing (the link's `v=2`, the mDNS TXT `v=2`). Version 1, where the device
  secret came from the QR alone, never shipped and is not accepted. The REST paths did not change, so
  they stay `/v1`.
- Additive features are announced as `capabilities`, not versions: a client checks for a capability before
  calling a route.

## What v1 adds

- Two-way metadata: `sync_log` op log filled by SQLite triggers, hybrid logical clocks, per-field LWW,
  counters for play counts, `GET /v1/sync/changes?since=` and `POST /v1/sync/changes`.
- TLS with a self-signed certificate whose SHA-256 is pinned in the QR (`fp=`), which also removes the
  phone's cleartext opt-in.
- mDNS-based reconnect, an optional fixed port, the 6-digit code path (under TLS), opt-in phone uploads.
- Reserved now so it needs no protocol bump: `?format=` on the audio route and a `transcode` capability.

## Security notes

- The secret in the QR is only shown while the window is open and is never stored; only the derived
  per-device secret is.
- Threat model for pairing: someone who photographs the QR **and** records the whole pairing exchange
  still cannot compute the device secret, because it is keyed by an X25519 shared secret that needs one of
  the two ephemeral private keys. Someone who has the QR and can actively intercept the phone's request
  before it reaches the desktop could pair in its place; the Allow / Deny prompt (with the phone's name)
  and the one-phone-per-QR window are the defence there, and TLS pinning in v1 closes it. An active
  attacker without the QR cannot substitute the desktop's key either: `keyProof` needs `k`.
- Revoking a device (from the desktop, or `DELETE /v1/sync/devices/self`) deletes its row, so its next
  request is a 404, and ends any audio stream it has open mid-file.
- `db:backup:export` deletes `sync_peers` rows from the exported copy with `secure_delete` on and then
  `VACUUM`s it, so a shared backup carries no device id or secret, not even in free pages.
- `db:backup:import` strips the same rows from a staged copy before it replaces the live library (a
  backup can never add a paired device) and restarts a running listener over the new library.
- Replay protection outlives the listener: switching sync off and on keeps the nonce cache, and a
  timestamp from before the app started is refused, which covers an app restart inside the skew window.
  Two side effects follow. A phone whose clock runs behind the desktop's gets 404s for up to 120 s after
  the desktop app starts, until its timestamps pass the start time (correcting with `serverTime` avoids
  it). A desktop clock stepped backwards (a manual change or a large NTP correction) makes requests look
  older than the start time, so they are refused until the clock catches up or the app restarts.
- v0 is plain HTTP: a sniffer on the same Wi-Fi cannot forge or replay requests, but can see track names
  and audio bytes. Use v0 on networks you trust.
