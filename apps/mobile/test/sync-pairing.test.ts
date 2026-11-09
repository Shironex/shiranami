import {
  SYNC_PAIR_LINK_PREFIX,
  SYNC_ROUTES,
  pairingPublicKey,
  parsePairingLink,
  toBase64Url,
  type PairRequest,
  type SyncPairingLink,
} from '@shiranami/contracts/sync';
import { migrateDbIfNeeded } from '@/lib/db';
import {
  SyncClient,
  findHost,
  isPrivateLanHost,
  type SyncFetch,
  type SyncRequestInit,
  type SyncResponse,
} from '@/lib/sync-client';
import { cleanDeviceName, pairWithDesktop, type PairingPhase } from '@/lib/sync-pairing';
import { forgetPeer, loadPeer, savePeer, type SecretStore } from '@/lib/sync-peer';
import { openTestDb } from './support/sqlite';

// The shared vectors of packages/contracts/src/sync/sync.test.ts and
// crates/shiranami-sync/tests/contract_vectors.rs (RFC 7748 keys).
const SECRET = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const PHONE_PRIVATE = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const PHONE_PUBLIC = 'hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo';
const DESKTOP_PUBLIC = '3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08';
const PROOF = 'viAAzEqSCV0va7LtCeoa647zZcs-C0cc5pbIDSF4fSs';
const KEY_PROOF = 'VdwbK1YiGfGj8J9oGYM1h15ys2YBY4qNODzpvlb6Nno';
const DEVICE_SECRET = 'R_T6TkxtTqk6KHHqxANdfbYs5MLiuZIJZvjiCB_Y8ew';
const SIGNATURE = 'qNUAzd9-_dlTBPKaWs2NP3q9LXVmauiBLGeZGzOSGkY';

const LINK = `${SYNC_PAIR_LINK_PREFIX}v=2&h=192.168.1.20%2C10.0.0.5&p=53111&id=desk-1&n=Studio+PC&t=nonce-0001&k=${SECRET}`;

function vectorKeys() {
  const secretKey = Uint8Array.from(PHONE_PRIVATE.match(/../g) ?? [], byte => parseInt(byte, 16));
  return { secretKey, publicKey: pairingPublicKey(secretKey) };
}

function response(status: number, body?: unknown): SyncResponse {
  return {
    status,
    headers: { get: () => null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('empty body');
      return body;
    },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

const PAIR_BODY = {
  deviceId: 'dev-0001',
  publicKey: DESKTOP_PUBLIC,
  keyProof: KEY_PROOF,
  desktopId: 'desk-1',
  desktopName: 'Studio PC',
  libraryId: 'lib-1',
  protocolVersion: 2,
  serverTime: 1762600100,
};

/**
 * A desktop on 192.168.1.20 (10.0.0.5 never connects): unsigned GETs are a
 * bare 404, the pair route answers with `pair`.
 */
function desktop(pair: (request: PairRequest) => SyncResponse | Promise<SyncResponse>) {
  const calls: { url: string; init: SyncRequestInit }[] = [];
  const fetchImpl: SyncFetch = async (url, init) => {
    calls.push({ url, init });
    if (!url.startsWith('http://192.168.1.20:53111/'))
      throw new TypeError('Network request failed');
    if (url.endsWith(SYNC_ROUTES.pair)) return pair(JSON.parse(init.body ?? '{}') as PairRequest);
    return response(404);
  };
  return { fetchImpl, calls };
}

function link(overrides: Partial<SyncPairingLink> = {}): SyncPairingLink {
  return { ...(parsePairingLink(LINK) as SyncPairingLink), ...overrides };
}

const pair = (fetchImpl: SyncFetch, extra: { signal?: AbortSignal } = {}) => {
  const phases: PairingPhase['kind'][] = [];
  const result = pairWithDesktop(link(), {
    fetch: fetchImpl,
    deviceName: 'Pixel 9',
    platform: 'android',
    keyPair: vectorKeys,
    now: () => 1762600000_000,
    onPhase: phase => phases.push(phase.kind),
    ...extra,
  });
  return { result, phases };
};

describe('isPrivateLanHost', () => {
  it.each(['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.20', '169.254.10.1'])(
    'accepts %s',
    host => expect(isPrivateLanHost(host)).toBe(true)
  );
  it.each(['8.8.8.8', '172.32.0.1', '100.64.0.1', '127.0.0.1', 'example.com', '192.168.1.256', ''])(
    'refuses %s',
    host => expect(isPrivateLanHost(host)).toBe(false)
  );
});

describe('findHost', () => {
  it('returns the first host that answers, in QR order', async () => {
    const { fetchImpl, calls } = desktop(() => response(500));
    expect(await findHost(fetchImpl, ['10.0.0.5', '192.168.1.20'], 53111)).toBe('192.168.1.20');
    expect(calls.map(c => c.url)).toEqual([
      'http://10.0.0.5:53111/v1/sync/hello',
      'http://192.168.1.20:53111/v1/sync/hello',
    ]);
    expect(await findHost(fetchImpl, ['10.0.0.5'], 53111)).toBeNull();
  });
});

describe('pairWithDesktop', () => {
  it('sends the shared proof, checks keyProof and derives the shared device secret', async () => {
    let sent: PairRequest | null = null;
    const { fetchImpl } = desktop(request => {
      sent = request;
      return response(200, PAIR_BODY);
    });
    const { result, phases } = pair(fetchImpl);
    const { peer, secret } = await result;

    expect(sent).toEqual({
      nonce: 'nonce-0001',
      deviceName: 'Pixel 9',
      platform: 'android',
      publicKey: PHONE_PUBLIC,
      proof: PROOF,
    });
    expect(secret).toBe(DEVICE_SECRET);
    expect(phases).toEqual(['connecting', 'waiting', 'paired']);
    expect(peer).toEqual({
      desktopId: 'desk-1',
      desktopName: 'Studio PC',
      libraryId: 'lib-1',
      hosts: ['192.168.1.20', '10.0.0.5'],
      port: 53111,
      deviceId: 'dev-0001',
      skew: 100,
      pairedAt: new Date(1762600000_000).toISOString(),
      lastSyncAt: null,
    });
  });

  it('refuses a desktop key whose proof does not match', async () => {
    // Someone without the QR answers with their own key, proved under the wrong secret.
    const forged = toBase64Url(new Uint8Array(32).fill(7));
    const { fetchImpl } = desktop(() =>
      response(200, { ...PAIR_BODY, publicKey: PHONE_PUBLIC, keyProof: forged })
    );
    await expect(pair(fetchImpl).result).rejects.toMatchObject({ code: 'unverified' });
  });

  it('refuses an answer from another desktop than the QR named', async () => {
    const { fetchImpl } = desktop(() => response(200, { ...PAIR_BODY, desktopId: 'desk-2' }));
    await expect(pair(fetchImpl).result).rejects.toMatchObject({ code: 'unverified' });
  });

  it.each([
    [403, 'pairing_denied', 'denied'],
    [408, 'pairing_timeout', 'timeout'],
    [409, 'pairing_busy', 'busy'],
    [410, 'pairing_closed', 'expired'],
    [429, 'rate_limited', 'rate_limited'],
    [404, undefined, 'bad_code'],
    [500, 'internal', 'failed'],
  ])('maps a %i (%s) to %s', async (status, error, code) => {
    const { fetchImpl } = desktop(() =>
      response(status, error ? { error, message: 'x' } : undefined)
    );
    await expect(pair(fetchImpl).result).rejects.toMatchObject({ code });
  });

  it('reports a desktop it cannot reach, on another network or switched off', async () => {
    const fetchImpl: SyncFetch = async () => {
      throw new TypeError('Network request failed');
    };
    const { result, phases } = pair(fetchImpl);
    await expect(result).rejects.toMatchObject({ code: 'unreachable' });
    expect(phases).toEqual(['connecting']);
  });

  it('refuses a QR whose hosts are not on a private network', async () => {
    const { fetchImpl, calls } = desktop(() => response(200, PAIR_BODY));
    await expect(
      pairWithDesktop(link({ hosts: ['8.8.8.8'] }), {
        fetch: fetchImpl,
        deviceName: 'Pixel',
        platform: 'android',
      })
    ).rejects.toMatchObject({ code: 'not_private' });
    expect(calls).toEqual([]);
  });

  it('refuses another protocol version', async () => {
    const { fetchImpl } = desktop(() => response(200, PAIR_BODY));
    await expect(
      pairWithDesktop(link({ version: 3 }), {
        fetch: fetchImpl,
        deviceName: 'Pixel',
        platform: 'android',
      })
    ).rejects.toMatchObject({ code: 'protocol' });
  });

  it('stops when cancelled while waiting for Allow', async () => {
    const controller = new AbortController();
    const { fetchImpl } = desktop(
      () =>
        new Promise<SyncResponse>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('aborted')));
          setTimeout(() => controller.abort(), 0);
        })
    );
    await expect(pair(fetchImpl, { signal: controller.signal }).result).rejects.toMatchObject({
      code: 'cancelled',
    });
  });

  it('names the phone sensibly', () => {
    expect(cleanDeviceName('  Pixel   9 Pro ')).toBe('Pixel 9 Pro');
    expect(cleanDeviceName(null)).toBe('Android phone');
  });
});

describe('SyncClient', () => {
  it('signs with the shared vector, correcting the clock by the skew', async () => {
    const calls: { url: string; init: SyncRequestInit }[] = [];
    const client = new SyncClient({
      fetch: async (url, init) => {
        calls.push({ url, init });
        return response(200, { ok: true });
      },
      host: '192.168.1.20',
      port: 53111,
      deviceId: 'dev-0001',
      secret: DEVICE_SECRET,
      skew: 100,
      now: () => 1762599900_000,
      nonce: () => 'abcdefghijklmnop',
    });
    await client.getJson(`${SYNC_ROUTES.manifest}?limit=2`);
    expect(calls[0].url).toBe('http://192.168.1.20:53111/v1/sync/manifest?limit=2');
    expect(calls[0].init.headers.Authorization).toBe(
      `SNM1 dev=dev-0001,ts=1762600000,n=abcdefghijklmnop,sig=${SIGNATURE}`
    );
  });

  it('never reuses a nonce and treats a bare 404 as unpaired', async () => {
    const seen: string[] = [];
    const client = new SyncClient({
      fetch: async (_url, init) => {
        seen.push(init.headers.Authorization);
        return response(404);
      },
      host: '192.168.1.20',
      port: 53111,
      deviceId: 'dev-0001',
      secret: DEVICE_SECRET,
      skew: 0,
    });
    await expect(client.hello()).rejects.toMatchObject({ code: 'unpaired' });
    await expect(client.favorites()).rejects.toMatchObject({ code: 'unpaired' });
    const nonces = seen.map(header => /n=([^,]+)/.exec(header)?.[1]);
    expect(new Set(nonces).size).toBe(2);
  });

  it('falls back to the real clock and nonce when they are passed as undefined', async () => {
    const seen: string[] = [];
    const client = new SyncClient({
      fetch: async (_url, init) => {
        seen.push(init.headers.Authorization);
        return response(200, { ok: true });
      },
      host: '192.168.1.20',
      port: 53111,
      deviceId: 'dev-0001',
      secret: DEVICE_SECRET,
      skew: 0,
      now: undefined,
      nonce: undefined,
    });
    await expect(client.hello()).resolves.toEqual({ ok: true });
    const ts = Number(/ts=(\d+)/.exec(seen[0])?.[1]);
    expect(Math.abs(ts - Math.floor(Date.now() / 1000))).toBeLessThan(5);
    expect(/n=([^,]+)/.exec(seen[0])?.[1]).toBeTruthy();
  });

  it('accepts a 404 from DELETE devices/self as already forgotten', async () => {
    const client = new SyncClient({
      fetch: async () => response(404),
      host: '192.168.1.20',
      port: 53111,
      deviceId: 'dev-0001',
      secret: DEVICE_SECRET,
      skew: 0,
    });
    await expect(client.unpair()).resolves.toBeUndefined();
  });
});

describe('peer storage', () => {
  function memorySecrets(): SecretStore & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
      values,
      get: async key => values.get(key) ?? null,
      set: async (key, value) => void values.set(key, value),
      remove: async key => void values.delete(key),
    };
  }

  it('keeps the secret out of SQLite and forgets both', async () => {
    const db = openTestDb();
    await migrateDbIfNeeded(db);
    const secrets = memorySecrets();
    const { fetchImpl } = desktop(() => response(200, PAIR_BODY));
    const { peer, secret } = await pair(fetchImpl).result;

    await savePeer(db, secrets, peer, secret);
    const stored = await db.getAllAsync<{ value: string }>('SELECT value FROM settings');
    expect(stored.map(s => s.value).join()).not.toContain(DEVICE_SECRET);
    expect(await loadPeer(db, secrets)).toEqual({ peer, secret: DEVICE_SECRET });

    await forgetPeer(db, secrets);
    expect(secrets.values.size).toBe(0);
    expect(await loadPeer(db, secrets)).toBeNull();
  });

  it('treats details without a secret as unpaired', async () => {
    const db = openTestDb();
    await migrateDbIfNeeded(db);
    const secrets = memorySecrets();
    const { fetchImpl } = desktop(() => response(200, PAIR_BODY));
    const { peer } = await pair(fetchImpl).result;
    await savePeer(db, secrets, peer, 'x');
    secrets.values.clear();
    expect(await loadPeer(db, secrets)).toBeNull();
  });
});
