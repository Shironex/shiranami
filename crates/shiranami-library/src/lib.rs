//! Filesystem-facing library management: scanning, validation, disk usage.
//!
//! `shiranami-library` owns the folder scan pipeline in both its flat and
//! grouped forms (`walkdir` + `rayon`, max depth 5, concurrency 16), the
//! cancellation token that replaces v1's `utilityProcess` handshake, throttled
//! progress reporting, batched file validation, and storage-usage accounting
//! by volume — including the Windows drive-root bucketing that v1 already
//! does. It composes `shiranami-db` and `shiranami-metadata`; a cancelled scan
//! must leave no partial rows behind.
//!
//! Ported in Phase 10. See `docs/v2/architecture.md` §2.2 (#16, #29).
