//! Which addresses the listener may bind.
//!
//! Never `0.0.0.0`: binding every interface would put the library on a VPN, a
//! hotspot uplink or a public address the user never meant to share. The
//! listener binds each **private** IPv4 address (RFC 1918 and link-local) on a
//! physical-looking interface, one socket per address, and refuses to start
//! when there is none.
//!
//! "Private" is not enough on its own: a VPN tunnel, a Tailscale or ZeroTier
//! overlay, Docker bridges and VM host-only networks all hand out RFC 1918
//! addresses, and each would let a peer that is not on the user's home
//! network reach the listener. Those interfaces are skipped by name (see
//! [`is_virtual_interface`]), and CGNAT space (`100.64.0.0/10`, which
//! Tailscale uses) is never private here.
//!
//! When several addresses remain, the one the OS would use for its default
//! route comes first: that is the network the user is actually on, so it is
//! the first host the QR lists. IPv6 is left out of v0: Android's NSD and the
//! QR both work with IPv4, and a ULA-only network is rare enough to wait for a
//! real report.

use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};

/// Interface name prefixes of tunnels, overlays, containers and VMs
/// (macOS, Linux, BSD), compared case-insensitively.
const VIRTUAL_PREFIXES: &[&str] = &[
    "utun",
    "tun",
    "tap",
    "wg",
    "docker",
    "br-",
    "veth",
    "vboxnet",
    "vmnet",
    "virbr",
    "zt",
    "tailscale",
    "bridge",
    "ipsec",
    "ppp",
];

/// Substrings of Windows adapter names for the same kinds of interface.
const VIRTUAL_FRAGMENTS: &[&str] = &[
    "vethernet",
    "hyper-v",
    "virtualbox",
    "vmware",
    "wsl",
    "tailscale",
    "zerotier",
    "wireguard",
    "openvpn",
    "docker",
];

/// Whether `ip` is an address a LAN listener may bind.
pub fn is_private_lan(ip: Ipv4Addr) -> bool {
    !ip.is_loopback() && !is_cgnat(ip) && (ip.is_private() || ip.is_link_local())
}

/// `100.64.0.0/10`, carrier-grade NAT and the Tailscale address space.
fn is_cgnat(ip: Ipv4Addr) -> bool {
    let [first, second, ..] = ip.octets();
    first == 100 && (second & 0b1100_0000) == 0b0100_0000
}

/// Whether an interface name belongs to a VPN, overlay, container or VM.
pub fn is_virtual_interface(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    VIRTUAL_PREFIXES
        .iter()
        .any(|prefix| name.starts_with(prefix))
        || VIRTUAL_FRAGMENTS
            .iter()
            .any(|fragment| name.contains(fragment))
}

/// The source address the OS picks for its default route, if it has one.
///
/// A connected UDP socket sends nothing; `connect` only asks the routing table
/// which local address would be used. The target is TEST-NET-3, never routed.
fn default_route_address() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket
        .connect(SocketAddr::from((Ipv4Addr::new(203, 0, 113, 1), 9)))
        .ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

/// Order candidates: the default-route address first, then RFC 1918 before
/// link-local, deduplicated.
fn rank(mut found: Vec<Ipv4Addr>, preferred: Option<Ipv4Addr>) -> Vec<Ipv4Addr> {
    found.sort_by_key(|ip| (Some(*ip) != preferred, ip.is_link_local(), *ip));
    found.dedup();
    found
}

/// Every private IPv4 address on a non-virtual interface, best first.
///
/// # Errors
///
/// The OS error when the interface list cannot be read.
pub fn private_ipv4_addresses() -> std::io::Result<Vec<Ipv4Addr>> {
    let found: Vec<Ipv4Addr> = if_addrs::get_if_addrs()?
        .into_iter()
        // Point-to-point links are tunnels (VPNs, PPP), never the Wi-Fi a phone is on.
        .filter(|interface| !interface.is_p2p() && !is_virtual_interface(&interface.name))
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(ip) if is_private_lan(ip) => Some(ip),
            _ => None,
        })
        .collect();
    Ok(rank(found, default_route_address()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_private_and_link_local_addresses_qualify() {
        assert!(is_private_lan(Ipv4Addr::new(192, 168, 1, 20)));
        assert!(is_private_lan(Ipv4Addr::new(10, 0, 0, 5)));
        assert!(is_private_lan(Ipv4Addr::new(172, 16, 4, 1)));
        assert!(is_private_lan(Ipv4Addr::new(169, 254, 3, 3)));
        assert!(!is_private_lan(Ipv4Addr::LOCALHOST));
        assert!(!is_private_lan(Ipv4Addr::UNSPECIFIED));
        assert!(!is_private_lan(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(!is_private_lan(Ipv4Addr::new(172, 32, 0, 1)));
    }

    #[test]
    fn cgnat_space_is_never_private() {
        assert!(!is_private_lan(Ipv4Addr::new(100, 64, 0, 1)));
        assert!(!is_private_lan(Ipv4Addr::new(100, 101, 102, 103)));
        assert!(!is_private_lan(Ipv4Addr::new(100, 127, 255, 254)));
        assert!(!is_cgnat(Ipv4Addr::new(100, 63, 255, 255)));
        assert!(!is_cgnat(Ipv4Addr::new(100, 128, 0, 0)));
    }

    #[test]
    fn tunnels_overlays_containers_and_vms_are_skipped() {
        for name in [
            "utun3",
            "tun0",
            "tap1",
            "wg0",
            "docker0",
            "br-1a2b3c",
            "veth9f",
            "vboxnet0",
            "vmnet8",
            "virbr0",
            "ztabcdef",
            "tailscale0",
            "bridge100",
            "vEthernet (WSL)",
            "VirtualBox Host-Only Ethernet Adapter",
            "VMware Network Adapter VMnet1",
            "ZeroTier One [abc]",
        ] {
            assert!(is_virtual_interface(name), "{name} must be skipped");
        }
        for name in ["en0", "en1", "eth0", "wlan0", "wlp3s0", "Wi-Fi", "Ethernet"] {
            assert!(!is_virtual_interface(name), "{name} is a real LAN");
        }
    }

    #[test]
    fn the_default_route_address_comes_first() {
        let found = vec![
            Ipv4Addr::new(169, 254, 1, 1),
            Ipv4Addr::new(10, 0, 0, 5),
            Ipv4Addr::new(192, 168, 1, 20),
            Ipv4Addr::new(10, 0, 0, 5),
        ];
        assert_eq!(
            rank(found.clone(), Some(Ipv4Addr::new(192, 168, 1, 20))),
            [
                Ipv4Addr::new(192, 168, 1, 20),
                Ipv4Addr::new(10, 0, 0, 5),
                Ipv4Addr::new(169, 254, 1, 1),
            ]
        );
        assert_eq!(
            rank(found, None),
            [
                Ipv4Addr::new(10, 0, 0, 5),
                Ipv4Addr::new(192, 168, 1, 20),
                Ipv4Addr::new(169, 254, 1, 1),
            ]
        );
    }
}
