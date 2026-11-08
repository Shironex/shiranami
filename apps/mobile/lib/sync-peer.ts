import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The paired desktop. Where to reach it and what it is called live in the
 * settings table; the device secret lives only in the platform keystore
 * (expo-secure-store), never in SQLite or AsyncStorage.
 */
export interface DesktopPeer {
  desktopId: string;
  desktopName: string;
  libraryId: string;
  /** Private addresses from the QR, the one that last answered first. */
  hosts: string[];
  port: number;
  /** The `dev=` of every signed request. */
  deviceId: string;
  /** Desktop clock minus phone clock, in seconds, from the last pair or hello. */
  skew: number;
  /** ISO timestamps. */
  pairedAt: string;
  lastSyncAt: string | null;
}

/** The keystore, injected so tests do not need the native module. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PEER_SETTING = 'syncDesktop';
export const SECRET_KEY = 'shiranami.sync.device-secret';

type StoredPeer = Pick<DesktopPeer, 'desktopId' | 'desktopName' | 'deviceId' | 'port' | 'hosts'> &
  Partial<DesktopPeer>;

function isPeer(value: unknown): value is StoredPeer {
  if (!value || typeof value !== 'object') return false;
  const peer = value as Record<string, unknown>;
  return (
    typeof peer.desktopId === 'string' &&
    typeof peer.desktopName === 'string' &&
    typeof peer.deviceId === 'string' &&
    typeof peer.port === 'number' &&
    Array.isArray(peer.hosts) &&
    peer.hosts.every(host => typeof host === 'string')
  );
}

/** The saved peer, or null; a peer whose secret is gone counts as unpaired. */
export async function loadPeer(
  db: SQLiteDatabase,
  secrets: SecretStore
): Promise<{ peer: DesktopPeer; secret: string } | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [PEER_SETTING]
  );
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return null;
  }
  if (!isPeer(parsed)) return null;
  const secret = await secrets.get(SECRET_KEY);
  if (!secret) return null;
  return {
    peer: { libraryId: '', skew: 0, pairedAt: '', lastSyncAt: null, ...parsed },
    secret,
  };
}

/** Saves the peer's details (not its secret). */
export async function savePeerDetails(db: SQLiteDatabase, peer: DesktopPeer): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    PEER_SETTING,
    JSON.stringify(peer),
  ]);
}

/** Saves a freshly paired desktop: secret to the keystore first, then the details. */
export async function savePeer(
  db: SQLiteDatabase,
  secrets: SecretStore,
  peer: DesktopPeer,
  secret: string
): Promise<void> {
  await secrets.set(SECRET_KEY, secret);
  await savePeerDetails(db, peer);
}

/** Forgets the desktop on this phone. The synced songs stay in the library. */
export async function forgetPeer(db: SQLiteDatabase, secrets: SecretStore): Promise<void> {
  await secrets.remove(SECRET_KEY);
  await db.runAsync('DELETE FROM settings WHERE key = ?', [PEER_SETTING]);
}

/** The hosts with `host` moved to the front, so the next sync tries it first. */
export function preferHost(hosts: string[], host: string): string[] {
  return [host, ...hosts.filter(other => other !== host)];
}
