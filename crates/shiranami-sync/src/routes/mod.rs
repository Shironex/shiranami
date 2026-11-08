//! The `/v1/sync` router, and the pieces every route shares: request
//! authentication, JSON bodies, query parameters and cursors.
//!
//! | Method + path | Auth | Body |
//! | ------------- | ---- | ---- |
//! | `POST /v1/sync/pair` | pairing proof | [`crate::wire::PairResponse`] |
//! | `GET /v1/sync/hello` | signed | [`crate::wire::SyncHello`] |
//! | `GET /v1/sync/manifest?cursor=&limit=` | signed | [`crate::wire::LibraryManifestPage`] |
//! | `GET /v1/sync/playlists` | signed | [`crate::wire::PlaylistsSnapshot`] |
//! | `GET /v1/sync/favorites` | signed | [`crate::wire::FavoritesSnapshot`] |
//! | `GET /v1/sync/history?cursor=&limit=` | signed | [`crate::wire::HistoryPage`] |
//! | `GET /v1/sync/art/{hash}` | signed | `image/jpeg` |
//! | `GET /v1/sync/tracks/{id}/audio` | signed | audio, `Range` / `If-Range` |
//! | `DELETE /v1/sync/devices/self` | signed | 204 |
//!
//! Anything else is a 404 with no body, the same answer as a bad signature.

mod files;
mod library;
mod pair;
mod shared;

pub(crate) use shared::{
    artwork_hash, authenticate, cursor, is_art_hash, json, limit, make_cursor, router,
};
