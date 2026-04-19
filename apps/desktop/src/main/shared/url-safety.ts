import * as dns from 'node:dns';
import ipaddr from 'ipaddr.js';

/**
 * SSRF guard for URLs that the renderer hands to the main process for outbound
 * `net.fetch` (currently the `shiranami-radio://` protocol handler — see
 * `radio-protocol.ts`).
 *
 * Why this exists
 * ---------------
 * The radio protocol passes an arbitrary `?url=` value through to Electron's
 * `net.fetch`. Without a guard, a malicious page (or a compromised
 * radio-browser entry, or a tampered playlist) could point us at
 * `http://127.0.0.1:8080/`, `http://10.0.0.1/`, `http://169.254.169.254/`
 * (cloud metadata), and so on, exfiltrating internal services through the
 * Electron app.
 *
 * Design choices (locked in — see issue #88)
 * ------------------------------------------
 * - **No allowlist.** radio-browser is worldwide and yt-dlp googlevideo URLs
 *   are dynamic; an allowlist is infeasible without breaking real usage.
 * - **No localhost / dev-mode override.** Security wins over dev convenience;
 *   any future opt-in must be gated explicitly behind a build-time flag.
 * - **No CGNAT (100.64/10) block.** Legitimate ISPs use that range for real
 *   subscribers — blocking it would break radio listeners on those networks.
 *
 * DNS rebinding caveat — "Option B"
 * ---------------------------------
 * We resolve the hostname once via `dns.promises.lookup` and reject if ANY
 * returned address is in a denied range. The fetch that follows performs its
 * own resolution inside Chromium's network stack, so a malicious server with
 * a low-TTL record could in principle return a public IP at lookup time and a
 * private IP at fetch time. We accept this small residual race window because
 * the alternative (pre-resolving and rewriting the URL) breaks TLS/SNI and is
 * ignored by Chromium's network stack anyway.
 *
 * // TODO(security): Extend this guard to other `net.fetch` / `net.request`
 * // call sites that handle renderer-derived URLs (e.g. `metadata-lookup.ts`,
 * // `playlist.ts` if its scope grows). Today the radio protocol is the only
 * // hot path; widen as new entry points appear.
 */

/** Why a URL was rejected. Renderer never sees this — main-side log only. */
export type UrlGuardReason = 'parse' | 'scheme' | 'private-ip' | 'dns';

export type UrlGuardResult =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlGuardReason };

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/** IPv4 ranges (per `ipaddr.js` `range()` classification) we never proxy to. */
const DENIED_IPV4_RANGES = new Set([
  'loopback',
  'private',
  'linkLocal',
  'multicast',
  'unspecified',
  'broadcast',
  'reserved',
]);

/** IPv6 ranges we never proxy to. `uniqueLocal` is the IPv6 equivalent of RFC1918. */
const DENIED_IPV6_RANGES = new Set([
  'loopback',
  'linkLocal',
  'multicast',
  'uniqueLocal',
  'unspecified',
]);

/**
 * Best-effort URL parse. Returns `null` on any failure, including non-string
 * input — callers must treat `null` as "reject".
 */
export function parseStreamUrl(input: string): URL | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/**
 * Strip the surrounding `[...]` from a bracketed IPv6 hostname. WHATWG's
 * `URL.hostname` keeps the brackets for IPv6 literals, but `ipaddr.js` rejects
 * the bracketed form — normalize before parsing.
 */
function unbracket(hostname: string): string {
  if (hostname.length >= 2 && hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * Classify a single literal IP. Returns `'denied'` if it falls in any range
 * we refuse to proxy to, `'ok'` otherwise. IPv4-mapped IPv6 addresses
 * (`::ffff:127.0.0.1`) are unwrapped and re-classified as IPv4 — without that
 * unwrap an attacker could bypass the IPv4 loopback check via the IPv6 form.
 */
function classifyAddress(address: string): 'ok' | 'denied' {
  let parsed: ReturnType<typeof ipaddr.parse>;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    // Defensive — if DNS hands us something that won't parse, treat as denied.
    return 'denied';
  }

  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      const unwrapped = v6.toIPv4Address();
      return DENIED_IPV4_RANGES.has(unwrapped.range()) ? 'denied' : 'ok';
    }
    return DENIED_IPV6_RANGES.has(v6.range()) ? 'denied' : 'ok';
  }

  // ipv4
  return DENIED_IPV4_RANGES.has((parsed as ipaddr.IPv4).range()) ? 'denied' : 'ok';
}

/**
 * Resolve and classify a URL string for outbound proxying. See file-level
 * JSDoc for the full design rationale.
 *
 * Steps:
 *   1. Parse the URL.
 *   2. Reject any scheme other than `http:` / `https:`.
 *   3. If the hostname is a literal IP, classify it directly.
 *   4. Otherwise resolve via DNS and reject if ANY returned address is denied.
 */
export async function isStreamUrlAllowed(input: string): Promise<UrlGuardResult> {
  const url = parseStreamUrl(input);
  if (!url) return { ok: false, reason: 'parse' };

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: 'scheme' };
  }

  const hostname = unbracket(url.hostname);
  if (hostname.length === 0) return { ok: false, reason: 'parse' };

  if (ipaddr.isValid(hostname)) {
    if (classifyAddress(hostname) === 'denied') {
      return { ok: false, reason: 'private-ip' };
    }
    return { ok: true, url };
  }

  // Hostname path: resolve once, fail-closed on any denied result.
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'dns' };
  }

  if (addresses.length === 0) return { ok: false, reason: 'dns' };

  for (const { address } of addresses) {
    if (classifyAddress(address) === 'denied') {
      return { ok: false, reason: 'private-ip' };
    }
  }

  return { ok: true, url };
}
