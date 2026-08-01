//! One module per v1 custom protocol, mapped onto a loopback route.
//!
//! | v1 protocol                      | module          | route                         |
//! | -------------------------------- | --------------- | ----------------------------- |
//! | `shiranami-audio://play?path=…`  | [`audio`]       | `GET /{token}/audio?path=…`   |
//! | `shiranami-art://art/{name}`     | [`art`]         | `GET /{token}/art/{name}`     |
//! | `shiranami-radio://stream?url=…` | [`radio`]       | `GET /{token}/radio?url=…`    |

pub mod art;
pub mod audio;
pub mod query;
pub mod radio;
