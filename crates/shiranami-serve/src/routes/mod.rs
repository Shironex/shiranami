//! One module per v1 custom protocol, mapped onto a loopback route.
//!
//! | v1 protocol                      | module          | route                         |
//! | -------------------------------- | --------------- | ----------------------------- |
//! | `shiranami-audio://play?path=…`  | [`audio`]       | `GET /{token}/audio?path=…`   |
//! | `shiranami-art://art/{name}`     | [`art`]         | `GET /{token}/art/{name}`     |
//! | `shiranami-radio://stream?url=…` | [`radio`]       | `GET /{token}/radio?url=…`    |
//!
//! Plus one route with no v1 protocol behind it, because v1 had no such feature:
//!
//! | —                                | [`background`]  | `GET /{token}/background/{name}` |
//!
//! [`image_file`] is not a route: it holds the name guard and response shape
//! that [`art`] and [`background`] share.

pub mod art;
pub mod audio;
pub mod background;
pub mod image_file;
pub mod query;
pub mod radio;
