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
  Tailscale, ZeroTier, WireGuard, OpenVPN or Docker. CGNAT space (`100.64.0.0/10`) never counts.
- The address the OS uses for its default route is listed first in the QR.
- Advertises `_shiranami._tcp.local.` over mDNS while running (TXT `v=1`, `id=<desktopId>`). A multicast
  failure is logged and ignored; the QR code is the primary path in v0.
- Separate from `shiranami-serve` (the loopback media server). It reuses that crate's Range parser,
  extension allowlist and chunked file streaming, nothing else.

## Pairing

The desktop opens a 5 minute window and shows a QR code with this link:

```
shiranami://pair?v=1&h=192.168.1.20,10.0.0.5&p=47321&id=<desktopId>&n=<desktopName>&t=<nonce>&k=<secret>
```

| Param | Meaning                                           |
| ----- | ------------------------------------------------- |
| `v`   | protocol version (1)                              |
| `h`   | comma separated host candidates, try in order     |
| `p`   | port                                              |
| `id`  | desktop id (stable per install)                   |
| `n`   | desktop display name                              |
| `t`   | one-time pairing nonce                            |
| `k`   | 32-byte pairing secret, base64url without padding |

The phone sends `POST /v1/sync/pair`:

```json
{ "nonce": "<t>", "deviceName": "Pixel 8", "platform": "android", "proof": "<base64url>" }
```

`proof = HMAC-SHA256(k, "shiranami-sync/v1/pair\n" + nonce + "\n" + deviceName + "\n" + platform)`.

The desktop shows an Allow / Deny prompt (the request is held up to 120 s). On Allow it answers
`PairResponse { deviceId, desktopId, desktopName, libraryId, protocolVersion, serverTime }` and closes the
window, so one QR pairs one phone. Both sides then derive the device secret; it never crosses the wire:

```
deviceSecret = HMAC-SHA256(k, "shiranami-sync/v1/device-secret\n" + deviceId)
```

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
- Transport limits per listening socket: 64 open connections (more are dropped at accept), 10 s to send
  a request head (then the connection is closed), and 16 requests handled at once across the listener
  (more wait; a streaming audio body does not hold a slot).

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
by the same `cargo test` run the drift guard diffs. The phone imports them, plus the link parser and the
signing helpers, from `@shiranami/contracts/sync`, a subpath with no Tauri import.

## Versioning

- The path carries the major version (`/v1`). A breaking change is `/v2`, served beside `/v1` for a while.
- `hello.protocolVersion` / `minProtocolVersion` say what the desktop speaks.
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
- `db:backup:export` deletes `sync_peers` rows from the exported copy, so a shared backup is not a sync
  credential.
- v0 is plain HTTP: a sniffer on the same Wi-Fi cannot forge or replay requests, but can see track names
  and audio bytes. Use v0 on networks you trust.
