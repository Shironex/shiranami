//! Address-range classification: which IPs we refuse to send a request to.
//!
//! Ported from the `DENIED_IPV4_RANGES` / `DENIED_IPV6_RANGES` sets in
//! `apps/desktop/src/main/shared/url-safety.ts`. Those sets named `ipaddr.js`
//! `range()` classifications; here the blocks are spelled out as CIDRs instead.
//!
//! **Why spelling them out is equivalent.** `ipaddr.js` `range()` returns the
//! *first* matching block in a fixed order, and the TypeScript then asked
//! whether that one name was in a denied set. That is only the same thing as
//! "is the address in the union of the denied blocks" if no denied block
//! overlaps an earlier non-denied one — which holds for both of its tables
//! (`carrierGradeNat` is disjoint from every denied v4 block, and all five
//! denied v6 blocks are ordered ahead of the rest). Writing the union directly
//! removes a dependency on a JavaScript library's key order and makes the
//! policy auditable in one screen.
//!
//! **CGNAT (`100.64.0.0/10`) is deliberately absent**, and this is the single
//! most important line in the file. Real ISPs hand that range to real
//! subscribers; blocking it would break radio playback for those users while
//! protecting nothing, because a CGNAT address is not our loopback or our LAN.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// IPv4 blocks no outbound request may target, as `(network, prefix length)`.
///
/// The union of `ipaddr.js`'s `unspecified`, `private`, `loopback`,
/// `linkLocal`, `multicast`, `broadcast` and `reserved` classifications.
/// `255.255.255.255/32` (broadcast) needs no row of its own: it falls inside
/// the `240.0.0.0/4` reserved block.
const DENIED_IPV4: &[(Ipv4Addr, u8)] = &[
    // "This network" — also where a bare `0.0.0.0` lands.
    (Ipv4Addr::new(0, 0, 0, 0), 8),
    // RFC 1918 private use.
    (Ipv4Addr::new(10, 0, 0, 0), 8),
    (Ipv4Addr::new(172, 16, 0, 0), 12),
    (Ipv4Addr::new(192, 168, 0, 0), 16),
    // Loopback.
    (Ipv4Addr::new(127, 0, 0, 0), 8),
    // RFC 3927 link-local. Contains 169.254.169.254, the cloud instance
    // metadata endpoint that makes SSRF interesting to an attacker in the
    // first place.
    (Ipv4Addr::new(169, 254, 0, 0), 16),
    // RFC 5735 / 5737 / 2544 reserved and testing-only blocks.
    (Ipv4Addr::new(192, 0, 0, 0), 24),
    (Ipv4Addr::new(192, 0, 2, 0), 24),
    (Ipv4Addr::new(192, 88, 99, 0), 24),
    (Ipv4Addr::new(198, 18, 0, 0), 15),
    (Ipv4Addr::new(198, 51, 100, 0), 24),
    (Ipv4Addr::new(203, 0, 113, 0), 24),
    // Multicast.
    (Ipv4Addr::new(224, 0, 0, 0), 4),
    // Reserved for future use, plus the limited broadcast address.
    (Ipv4Addr::new(240, 0, 0, 0), 4),
];

/// IPv6 blocks no outbound request may target.
///
/// `::/128` and `::1/128` are listed for completeness even though
/// [`embedded_ipv4`] unwraps both into IPv4 before this table is consulted —
/// the tests pin the *outcome* for those two addresses so the behaviour holds
/// whichever branch happens to catch them.
const DENIED_IPV6: &[(Ipv6Addr, u8)] = &[
    // Unspecified.
    (Ipv6Addr::UNSPECIFIED, 128),
    // Loopback.
    (Ipv6Addr::LOCALHOST, 128),
    // Unique local — the IPv6 answer to RFC 1918.
    (Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 0), 7),
    // Link-local.
    (Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 0), 10),
    // Multicast.
    (Ipv6Addr::new(0xff00, 0, 0, 0, 0, 0, 0, 0), 8),
];

/// Whether an address falls in a block we refuse to send a request to.
///
/// IPv6 addresses that embed an IPv4 address are unwrapped and judged as IPv4,
/// so `http://[::ffff:127.0.0.1]/` cannot walk past the loopback rule by
/// changing syntax.
pub fn is_denied(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(v4) => is_denied_v4(v4),
        IpAddr::V6(v6) => match embedded_ipv4(v6) {
            Some(v4) => is_denied_v4(v4),
            None => is_denied_v6(v6),
        },
    }
}

/// The IPv4 address embedded in an IPv6 one, if there is one.
///
/// Two forms carry an IPv4 address in their low 32 bits, and both must be
/// unwrapped:
///
/// - **IPv4-mapped**, `::ffff:0:0/96` — the ordinary `::ffff:127.0.0.1`.
/// - **IPv4-compatible**, `::/96` — deprecated by RFC 4291 §2.5.5.1, and the
///   one that actually bit us. WHATWG URL canonicalisation rewrites
///   `::127.0.0.1` to `::7f00:1`, which no longer *looks* like an embedded
///   IPv4 address to a library checking for the mapped form, so the
///   TypeScript grew an explicit `::/96` branch. Same branch, same reason.
fn embedded_ipv4(address: Ipv6Addr) -> Option<Ipv4Addr> {
    let segments = address.segments();
    let is_mapped = segments[0..5] == [0, 0, 0, 0, 0] && segments[5] == 0xffff;
    let is_compatible = segments[0..6] == [0, 0, 0, 0, 0, 0];

    if is_mapped || is_compatible {
        let low = (u32::from(segments[6]) << 16) | u32::from(segments[7]);
        return Some(Ipv4Addr::from(low));
    }
    None
}

fn is_denied_v4(address: Ipv4Addr) -> bool {
    let bits = u32::from(address);
    DENIED_IPV4.iter().any(|&(network, prefix)| {
        // A prefix of 0 would make the shift below overflow; none of our rows
        // use one, but the guard keeps the helper total rather than relying on
        // the table never growing a default route.
        let mask = if prefix == 0 {
            0
        } else {
            u32::MAX << (32 - prefix)
        };
        bits & mask == u32::from(network) & mask
    })
}

fn is_denied_v6(address: Ipv6Addr) -> bool {
    let bits = u128::from(address);
    DENIED_IPV6.iter().any(|&(network, prefix)| {
        let mask = if prefix == 0 {
            0
        } else {
            u128::MAX << (128 - prefix)
        };
        bits & mask == u128::from(network) & mask
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn denied(literal: &str) -> bool {
        is_denied(literal.parse().expect("test address literal parses"))
    }

    /// The literal-IPv4 vectors from `url-safety.test.ts`, one for each reason
    /// an address can be refused.
    #[test]
    fn denies_every_v4_block_the_typescript_denied() {
        for address in [
            "127.0.0.1",       // loopback
            "10.0.0.5",        // RFC 1918 /8
            "192.168.1.1",     // RFC 1918 /16
            "172.16.0.1",      // RFC 1918 /12
            "169.254.169.254", // link-local, and the cloud metadata endpoint
            "224.0.0.1",       // multicast
            "0.0.0.0",         // unspecified
            "255.255.255.255", // broadcast, via the 240.0.0.0/4 row
            "192.0.2.1",       // TEST-NET-1
            "198.18.0.1",      // benchmarking
            "203.0.113.1",     // TEST-NET-3
        ] {
            assert!(denied(address), "{address} must be denied");
        }
    }

    #[test]
    fn allows_ordinary_public_v4() {
        for address in ["8.8.8.8", "1.1.1.1", "93.184.216.34"] {
            assert!(!denied(address), "{address} must be allowed");
        }
    }

    /// The one deliberate hole in the policy. An ISP that puts its subscribers
    /// behind carrier-grade NAT gives them addresses in this block; denying it
    /// would break radio playback for those users and protect nothing, since
    /// the range is neither our loopback nor our LAN.
    #[test]
    fn allows_cgnat_deliberately() {
        assert!(!denied("100.64.0.1"));
        assert!(!denied("100.127.255.254"));
    }

    /// The boundary rows are where an off-by-one in a prefix length hides: the
    /// address one below and one above each block must land on the other side.
    #[test]
    fn respects_block_boundaries() {
        assert!(denied("172.31.255.255"), "172.16.0.0/12 ends at 172.31.x");
        assert!(!denied("172.32.0.1"), "172.32.0.0 is outside the /12");
        assert!(!denied("172.15.255.255"), "172.15.x is below the /12");
        assert!(denied("198.19.255.255"), "198.18.0.0/15 covers 198.19.x");
        assert!(!denied("198.20.0.1"), "198.20.0.0 is outside the /15");
        assert!(denied("239.255.255.255"), "224.0.0.0/4 ends at 239.x");
    }

    /// The literal-IPv6 vectors, including both embedded-IPv4 syntaxes. These
    /// are the bypass attempts: same forbidden destination, different spelling.
    #[test]
    fn denies_every_v6_block_and_both_embedded_v4_forms() {
        for address in [
            "::1",               // loopback
            "::",                // unspecified
            "::ffff:127.0.0.1",  // IPv4-mapped loopback
            "::127.0.0.1",       // IPv4-compatible loopback (deprecated form)
            "::169.254.169.254", // IPv4-compatible metadata endpoint
            "::ffff:169.254.169.254",
            "fe80::1", // link-local
            "fc00::1", // unique local
            "fd00::1", // unique local, the half actually in use
            "ff00::1", // multicast
        ] {
            assert!(denied(address), "{address} must be denied");
        }
    }

    #[test]
    fn allows_ordinary_public_v6() {
        for address in ["2001:4860:4860::8888", "2606:4700:4700::1111"] {
            assert!(!denied(address), "{address} must be allowed");
        }
    }

    /// An embedded *public* IPv4 stays allowed. Without this the unwrap would
    /// read as "any `::`-prefixed address is suspicious", which is not the
    /// rule — the rule is that the embedded address is judged on its own
    /// merits.
    #[test]
    fn allows_an_embedded_public_v4() {
        assert!(!denied("::ffff:8.8.8.8"));
        assert!(!denied("::8.8.8.8"));
    }
}
