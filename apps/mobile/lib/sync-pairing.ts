import {
  SYNC_PROTOCOL_VERSION,
  SYNC_ROUTES,
  deriveDeviceSecret,
  generatePairingKeyPair,
  pairRequestProof,
  verifyPairResponse,
  type PairRequest,
  type PairResponse,
  type SyncPairingKeyPair,
  type SyncPairingLink,
} from '@shiranami/contracts/sync';
import {
  SyncError,
  asSyncError,
  baseUrl,
  errorCodeOf,
  findHost,
  isPrivateLanHost,
  timeoutSignal,
  type SyncFetch,
} from '@/lib/sync-client';
import { preferHost, type DesktopPeer } from '@/lib/sync-peer';

/**
 * Pairing, protocol 2: an ephemeral X25519 key pair, a proof under the QR
 * secret, then the desktop holds the request until its user presses Allow.
 * The desktop's answer is checked (`keyProof`) before the device secret is
 * derived; the secret itself never crosses the wire.
 */

/** The desktop holds the request up to 120 s; a little slack for the network. */
export const PAIR_TIMEOUT_MS = 130_000;

/** Where an attempt is, for the screen. */
export type PairingPhase =
  | { kind: 'connecting'; desktopName: string }
  | { kind: 'waiting'; desktopName: string; host: string }
  | { kind: 'paired'; desktopName: string };

export interface PairingDeps {
  fetch: SyncFetch;
  /** Shown in the desktop's Allow / Deny prompt. */
  deviceName: string;
  platform: string;
  signal?: AbortSignal;
  onPhase?: (phase: PairingPhase) => void;
  keyPair?: () => SyncPairingKeyPair;
  now?: () => number;
}

export interface PairingResult {
  peer: DesktopPeer;
  /** The derived device secret, base64url. Goes to secure storage only. */
  secret: string;
}

const PAIR_ERRORS: Record<number, SyncError['code']> = {
  403: 'denied',
  404: 'bad_code',
  408: 'timeout',
  409: 'busy',
  410: 'expired',
  429: 'rate_limited',
};

/** Trims a device name to what the desktop accepts in its prompt. */
export function cleanDeviceName(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 64);
  return clean || 'Android phone';
}

/** Pairs with the desktop whose QR was scanned. Throws a SyncError on any refusal. */
export async function pairWithDesktop(
  link: SyncPairingLink,
  deps: PairingDeps
): Promise<PairingResult> {
  const { fetch: fetchImpl, signal, onPhase } = deps;
  const desktopName = link.desktopName || 'your desktop';
  if (link.version !== SYNC_PROTOCOL_VERSION) {
    throw new SyncError('protocol', `link version ${link.version}`);
  }
  const hosts = link.hosts.filter(isPrivateLanHost);
  if (hosts.length === 0) throw new SyncError('not_private');

  onPhase?.({ kind: 'connecting', desktopName });
  const host = await findHost(fetchImpl, hosts, link.port, signal);
  if (!host) throw new SyncError('unreachable');

  const keys = (deps.keyPair ?? generatePairingKeyPair)();
  const deviceName = cleanDeviceName(deps.deviceName);
  const request: PairRequest = {
    nonce: link.nonce,
    deviceName,
    platform: deps.platform,
    publicKey: keys.publicKey,
    proof: pairRequestProof(link.secret, link.nonce, deviceName, deps.platform, keys.publicKey),
  };

  onPhase?.({ kind: 'waiting', desktopName, host });
  const timer = timeoutSignal(PAIR_TIMEOUT_MS, signal);
  let response: PairResponse;
  try {
    const reply = await fetchImpl(`${baseUrl(host, link.port)}${SYNC_ROUTES.pair}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: timer.signal,
    });
    if (reply.status !== 200) {
      const code = PAIR_ERRORS[reply.status];
      throw new SyncError(code ?? 'failed', `${reply.status} ${(await errorCodeOf(reply)) ?? ''}`);
    }
    response = (await reply.json()) as PairResponse;
  } catch (error) {
    if (timer.timedOut()) throw new SyncError('timeout');
    throw asSyncError(error, signal);
  } finally {
    timer.done();
  }

  // Someone answering in the desktop's place never saw the QR, so cannot make
  // this proof; and the desktop must be the one the QR named.
  if (
    !verifyPairResponse(link.secret, keys.publicKey, response) ||
    response.desktopId !== link.desktopId
  ) {
    throw new SyncError('unverified');
  }
  let secret: string;
  try {
    secret = deriveDeviceSecret({
      secretKey: keys.secretKey,
      phonePublicKey: keys.publicKey,
      desktopPublicKey: response.publicKey,
      deviceId: response.deviceId,
      pairingSecret: link.secret,
    });
  } catch {
    throw new SyncError('unverified');
  } finally {
    keys.secretKey.fill(0);
  }

  const now = (deps.now ?? Date.now)();
  onPhase?.({ kind: 'paired', desktopName: response.desktopName || desktopName });
  return {
    secret,
    peer: {
      desktopId: response.desktopId,
      desktopName: response.desktopName || desktopName,
      libraryId: response.libraryId,
      hosts: preferHost(hosts, host),
      port: link.port,
      deviceId: response.deviceId,
      skew: Math.round(response.serverTime - now / 1000),
      pairedAt: new Date(now).toISOString(),
      lastSyncAt: null,
    },
  };
}
