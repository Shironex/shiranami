//! The DNS seam the SSRF guard resolves through.
//!
//! The guard has to do its own name resolution: [`super::ranges::is_denied`]
//! classifies addresses, and a hostname is not an address. v1 called
//! `dns.promises.lookup(hostname, { all: true, verbatim: true })` and its tests
//! mocked `node:dns` wholesale; this trait is that mock point, made explicit.
//!
//! **`all: true` is the load-bearing option.** A name that resolves to both a
//! public and a private address must be refused, so the resolver returns every
//! address rather than the one the OS would have picked. `verbatim: true` has
//! no counterpart here and needs none — it only suppressed RFC 6724 reordering,
//! which cannot matter to a check that reads the whole list.

use std::future::Future;
use std::io;
use std::net::IpAddr;
use std::pin::Pin;

/// The future a [`Resolver`] returns.
///
/// Boxed rather than an `async fn` in the trait so the trait stays object-safe:
/// the guard holds an `Arc<dyn Resolver>` (architecture §2.3's `Arc<dyn Trait>`
/// seam) precisely so a test — or Phase 8's radio-proxy tests — can substitute
/// a fixed answer without the type parameter spreading into the HTTP client and
/// out again into every caller.
pub type ResolveFuture<'a> = Pin<Box<dyn Future<Output = io::Result<Vec<IpAddr>>> + Send + 'a>>;

/// Resolves a hostname to every address it currently answers with.
pub trait Resolver: Send + Sync {
    /// Resolve `host`, returning all addresses.
    ///
    /// An empty vector and an error mean the same thing to the guard — the name
    /// could not be checked, so the request does not go out.
    fn resolve<'a>(&'a self, host: &'a str) -> ResolveFuture<'a>;
}

/// The real resolver: the operating system's, via tokio's threadpooled
/// `getaddrinfo`.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemResolver;

impl Resolver for SystemResolver {
    fn resolve<'a>(&'a self, host: &'a str) -> ResolveFuture<'a> {
        Box::pin(async move {
            // `lookup_host` resolves a *socket* address, so it wants a port. The
            // port plays no part in the answer and none in the classification,
            // so it is 0 rather than the URL's — passing the real one would
            // imply it mattered.
            let addresses = tokio::net::lookup_host((host, 0)).await?;
            Ok(addresses.map(|socket| socket.ip()).collect())
        })
    }
}

/// Test doubles, shared with the guard's own tests.
///
/// Declared here rather than inside `mod tests` so both modules can reach it
/// without an item trailing the test module.
#[cfg(test)]
pub(crate) mod testing {
    use super::{ResolveFuture, Resolver};
    use std::collections::HashMap;
    use std::io;
    use std::net::IpAddr;

    /// A resolver with a fixed answer book, standing in for `vi.mock('node:dns')`.
    pub(crate) struct StaticResolver {
        answers: HashMap<String, io::Result<Vec<IpAddr>>>,
    }

    impl StaticResolver {
        pub(crate) fn new() -> Self {
            Self {
                answers: HashMap::new(),
            }
        }

        pub(crate) fn answering(mut self, host: &str, addresses: &[&str]) -> Self {
            let parsed = addresses
                .iter()
                .map(|address| address.parse().expect("test address literal parses"))
                .collect();
            self.answers.insert(host.to_owned(), Ok(parsed));
            self
        }

        pub(crate) fn failing(mut self, host: &str) -> Self {
            self.answers.insert(
                host.to_owned(),
                Err(io::Error::new(io::ErrorKind::NotFound, "ENOTFOUND")),
            );
            self
        }
    }

    impl Resolver for StaticResolver {
        fn resolve<'a>(&'a self, host: &'a str) -> ResolveFuture<'a> {
            let answer = match self.answers.get(host) {
                Some(Ok(addresses)) => Ok(addresses.clone()),
                Some(Err(error)) => Err(io::Error::new(error.kind(), error.to_string())),
                None => Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("no canned answer for {host}"),
                )),
            };
            Box::pin(async move { answer })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn the_system_resolver_resolves_a_literal_without_touching_the_network() {
        // An IP literal is answered by `getaddrinfo` itself, so this exercises
        // the real resolver without depending on DNS being reachable in CI.
        let resolved = SystemResolver
            .resolve("127.0.0.1")
            .await
            .expect("a literal always resolves");
        assert_eq!(
            resolved,
            vec!["127.0.0.1".parse::<IpAddr>().expect("literal")]
        );
    }
}
