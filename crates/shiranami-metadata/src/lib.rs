//! Tags and cover art: everything read from or written back to a media file.
//!
//! `shiranami-metadata` owns `lofty`-based tag reading and writing across
//! ID3/Vorbis/MP4 — replacing music-metadata, node-id3, flac-tagger and the
//! ffmpeg re-mux path in one dependency — plus the album-art pipeline:
//! extract, resize to 512 px longest edge, encode JPEG q85, content-address by
//! hash, cache, and prune orphans. v2 has exactly one art pipeline, unlike
//! v1's split between the main process and the scan utility. It also owns the
//! iTunes lookup, title cleaning and the batched enrich flow.
//!
//! Ported in Phase 9. Byte-parity with v1's encoder is explicitly abandoned:
//! existing files are served by the hash already stored in `tracks.album_art`
//! and regenerated only when missing. See `docs/v2/architecture.md` §3.3.
